import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular';
import type { User } from 'firebase/auth';

import { AcademyService } from '../../core/academy.service';
import type {
  AcademyClass,
  AcademyData,
  AcademyUser,
  Announcement,
  ClassSession,
  Payment,
  StudentProfile,
} from '../../core/models';

type Section =
  | 'overview'
  | 'attendance'
  | 'progress'
  | 'profile'
  | 'edit-profile'
  | 'certificates'
  | 'settings'
  | 'history'
  | 'finance'
  | 'announcements'
  | 'shop'
  | 'management';
type AuthMode = 'login' | 'academy' | 'student';
type AuthStep =
  'welcome' | 'onboarding' | 'login' | 'register' | 'belt-question' | 'belt-select' | 'forgot' | 'forgot-sent';
type CavernasView = 'permission' | 'list' | 'schedule' | 'checkin';
type GymFilter = 'near' | 'open' | 'today';

export interface TrailBelt {
  name: string;
  color: string;
  description: string;
  status: 'done' | 'current' | 'locked';
  total: number;
}

const AUTH_INITIALIZATION_TIMEOUT_MS = 12000;
const ACADEMY_DATA_TIMEOUT_MS = 15000;
const FORGOT_RETURN_MS = 60000;
const LOCATION_STORAGE_KEY = 'caverna.location';

export const DEFAULT_BELTS: { name: string; color: string; description: string }[] = [
  { name: 'Faixa Branca', color: '#f5f5f5', description: 'Fundamentos e primeiros passos.' },
  { name: 'Faixa Amarela', color: '#fdd835', description: 'Técnicas básicas e maior controle.' },
  { name: 'Faixa Laranja', color: '#fb8c3c', description: 'Combinações e resistência.' },
  { name: 'Faixa Verde', color: '#4cbb6c', description: 'Estratégia e consistência.' },
  { name: 'Faixa Azul', color: '#4f7fc4', description: 'Técnicas avançadas e aplicação em situações reais.' },
  { name: 'Faixa Roxa', color: '#8e55a8', description: 'Domínio técnico e mental.' },
  { name: 'Faixa Marrom', color: '#8b5a35', description: 'Liderança, ensino e performance.' },
  { name: 'Faixa Preta', color: '#1f1f23', description: 'Maestria, legado e formação de novos atletas.' },
];

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^faixa\s+/, '')
    .trim();
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [DatePipe, DecimalPipe, FormsModule, IonContent, NgTemplateOutlet],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly academy = inject(AcademyService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  authMode: AuthMode = 'login';
  authStep: AuthStep = 'welcome';
  onboardingIndex = 0;
  readonly onboardingSlides = [
    {
      icon: '🏔️',
      title: 'Sua trilha começa\nna caverna',
      text: 'Registre seus treinos, acompanhe checkpoints e veja sua evolução a cada aula.',
    },
    {
      icon: '🌍',
      title: 'Faixa justa,\nem qualquer unidade',
      text: 'Sua trilha técnica segue o padrão da CBJJ — treine em academias diferentes sem perder seu progresso.',
    },
    {
      icon: '📍',
      title: 'Check-in em\npoucos segundos',
      text: 'Encontre a caverna mais próxima, escolha o horário e confirme sua presença na recepção.',
    },
  ];
  readonly beltOptions = DEFAULT_BELTS.slice(0, 7);
  showPassword = false;
  graduated: boolean | null = null;
  declaredBelt = '';
  certificateName = '';
  forgotEmail = '';
  section: Section = 'overview';
  cavernasView: CavernasView = 'permission';
  locationLabel = '';
  gymSearch = '';
  gymFilter: GymFilter = 'near';
  selectedDate = HomePage.defaultScheduleDate();
  selectedSessionId = '';
  rollCallSessionId = '';
  editName = '';
  authForm = { name: '', email: '', password: '', gymName: '', address: '', gymId: '' };
  classForm = { name: '', modality: 'Jiu-jitsu', level: 'Todos', startTime: '19:00', endTime: '20:30' };
  sessionForm = { classId: '', date: new Date().toISOString().slice(0, 10), startTime: '19:00', endTime: '20:30' };
  announcementForm = { title: '', message: '', audience: 'all' as 'all' | 'students' | 'staff' };
  videoForm = { title: '', description: '', url: '' };
  productForm = { name: '', category: 'Kimono', price: 0, stock: 0 };
  paymentForm = {
    userId: '',
    referenceMonth: new Date().toISOString().slice(0, 7),
    dueDate: '',
    amount: 0,
    method: 'PIX',
  };
  beltForm = { name: '', order: 1, colorHex: '#d8d8d8', minMonths: 0, minClasses: 0, minMatMinutes: 0 };
  quantities: Record<string, number> = {};
  data: AcademyData | null = null;
  loading = true;
  saving = false;
  error = '';
  notice = '';
  authTimedOut = false;
  private unsubscribeAuth?: () => void;
  private authTimeout?: ReturnType<typeof setTimeout>;
  private authRequestId = 0;
  private forgotTimeout?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.locationLabel = this.readStoredLocation();
    if (this.locationLabel) this.cavernasView = 'list';
    this.watchAuth();
  }

  ngOnDestroy(): void {
    this.clearAuthTimeout();
    this.clearForgotTimeout();
    this.unsubscribeAuth?.();
  }

  private static defaultScheduleDate(): string {
    const today = new Date();
    if (today.getDay() === 0) today.setDate(today.getDate() + 1);
    return localDateKey(today);
  }

  goToAuth(step: AuthStep): void {
    if (step !== 'forgot-sent') this.clearForgotTimeout();
    if (step === 'login') this.authMode = 'login';
    if (step === 'register' && this.authMode === 'login') this.authMode = 'student';
    if (step === 'forgot') this.forgotEmail = this.authForm.email;
    this.authStep = step;
    this.error = '';
    this.notice = '';
    this.showPassword = false;
  }

  startRegistration(mode: 'student' | 'academy' = 'student'): void {
    this.authMode = mode;
    this.goToAuth('register');
  }

  nextOnboarding(): void {
    if (this.onboardingIndex < this.onboardingSlides.length - 1) this.onboardingIndex++;
    else this.startRegistration();
  }

  continueRegistration(): void {
    this.error = '';
    const { name, email, password, gymId, gymName } = this.authForm;
    if (!name.trim() || !email.trim()) return this.showError('Preencha nome e e-mail.');
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
      return this.showError('A senha precisa ter no mínimo 8 caracteres, com letras e números.');
    if (this.authMode === 'academy') {
      if (!gymName.trim()) return this.showError('Informe o nome da academia.');
      void this.submitAuth();
      return;
    }
    if (!gymId.trim()) return this.showError('Informe o código da academia.');
    this.authStep = 'belt-question';
  }

  continueBeltQuestion(): void {
    if (this.graduated === null) return this.showError('Escolha uma opção para continuar.');
    this.error = '';
    if (this.graduated) this.authStep = 'belt-select';
    else {
      this.declaredBelt = '';
      void this.submitAuth();
    }
  }

  continueBeltSelect(): void {
    if (!this.declaredBelt) return this.showError('Selecione sua faixa.');
    void this.submitAuth();
  }

  selectCertificate(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.certificateName = input.files?.[0]?.name ?? '';
  }

  async sendPasswordReset(): Promise<void> {
    if (!this.forgotEmail.trim()) return this.showError('Informe o e-mail da sua conta.');
    this.error = '';
    this.saving = true;
    try {
      await this.academy.sendPasswordReset(this.forgotEmail);
      this.showForgotSent();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'auth/user-not-found') this.showForgotSent();
      else this.error = this.errorMessage(error);
    } finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }

  private showForgotSent(): void {
    this.authStep = 'forgot-sent';
    this.clearForgotTimeout();
    this.forgotTimeout = setTimeout(() => {
      this.forgotTimeout = undefined;
      if (this.authStep === 'forgot-sent') this.goToAuth('login');
      this.changeDetector.markForCheck();
    }, FORGOT_RETURN_MS);
  }

  private clearForgotTimeout(): void {
    if (this.forgotTimeout) clearTimeout(this.forgotTimeout);
    this.forgotTimeout = undefined;
  }

  get activeTab(): 'overview' | 'progress' | 'attendance' | 'profile' {
    if (this.section === 'overview' || this.section === 'progress' || this.section === 'attendance')
      return this.section;
    return 'profile';
  }

  openTab(tab: 'overview' | 'progress' | 'attendance' | 'profile'): void {
    this.section = tab;
    this.error = '';
    this.notice = '';
    if (tab === 'attendance' && this.cavernasView !== 'permission') this.cavernasView = 'list';
  }

  openSection(section: Section): void {
    this.section = section;
    this.error = '';
    this.notice = '';
    if (section === 'edit-profile') this.editName = this.data?.user.name ?? '';
  }

  requestLocation(): void {
    const done = (label: string): void => {
      this.locationLabel = label;
      this.cavernasView = 'list';
      try {
        localStorage.setItem(LOCATION_STORAGE_KEY, label);
      } catch {
        // armazenamento indisponível
      }
      this.changeDetector.markForCheck();
    };
    if (typeof navigator === 'undefined' || !navigator.geolocation) return done('Busca manual');
    navigator.geolocation.getCurrentPosition(
      () => done('Perto de você'),
      () => done('Busca manual'),
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  skipLocation(): void {
    this.locationLabel = 'Busca manual';
    this.cavernasView = 'list';
  }

  openCaverns(): void {
    this.section = 'attendance';
    this.cavernasView = this.locationLabel ? 'list' : 'permission';
  }

  openSchedule(): void {
    this.section = 'attendance';
    this.cavernasView = 'schedule';
  }

  openCheckIn(session?: ClassSession): void {
    const target = session ?? this.todaySession ?? this.upcomingSessions[0];
    this.section = 'attendance';
    this.error = '';
    this.notice = '';
    if (!target) {
      this.cavernasView = 'schedule';
      return;
    }
    this.selectedSessionId = target.id;
    this.cavernasView = 'checkin';
  }

  get gymInitials(): string {
    const words = (this.data?.gymName ?? 'Caverna')
      .replace(/[—-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 || /^[A-Z]/.test(word));
    return ((words[0]?.[0] ?? 'C') + (words.at(-1)?.[0] ?? '')).toUpperCase();
  }

  get gymHasSessionToday(): boolean {
    const today = localDateKey(new Date());
    return (this.data?.sessions ?? []).some((session) => session.date === today);
  }

  get gymOpenNow(): boolean {
    const today = localDateKey(new Date());
    return (this.data?.sessions ?? []).some((session) => session.date === today && session.status === 'open');
  }

  get gymVisible(): boolean {
    if (!this.data) return false;
    const term = normalizeName(this.gymSearch);
    const matches =
      !term || normalizeName(`${this.data.gymName} ${this.data.gymAddress}`).includes(term.replace(/^faixa\s+/, ''));
    if (!matches) return false;
    if (this.gymFilter === 'open') return this.gymOpenNow;
    if (this.gymFilter === 'today') return this.gymHasSessionToday;
    return true;
  }

  get weekDays(): { key: string; short: string; day: string }[] {
    const base = parseDateKey(this.selectedDate);
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        key: localDateKey(date),
        short: WEEKDAYS_SHORT[date.getDay()],
        day: String(date.getDate()).padStart(2, '0'),
      };
    });
  }

  shiftWeek(direction: number): void {
    const date = parseDateKey(this.selectedDate);
    date.setDate(date.getDate() + direction * 7);
    this.selectedDate = localDateKey(date);
  }

  get selectedDateLabel(): string {
    const date = parseDateKey(this.selectedDate);
    return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
  }

  get sessionsForSelectedDate(): ClassSession[] {
    return (this.data?.sessions ?? [])
      .filter((session) => session.date === this.selectedDate)
      .sort((first, second) => first.startTime.localeCompare(second.startTime));
  }

  get todaySession(): ClassSession | undefined {
    const today = localDateKey(new Date());
    return (this.data?.sessions ?? [])
      .filter((session) => session.date === today && session.status === 'open')
      .sort((first, second) => first.startTime.localeCompare(second.startTime))[0];
  }

  get selectedSession(): ClassSession | undefined {
    return this.data?.sessions.find((session) => session.id === this.selectedSessionId);
  }

  sessionDayLabel(session: ClassSession, long = false): string {
    const date = parseDateKey(session.date);
    return long
      ? `${WEEKDAYS_LONG[date.getDay()]}-feira`.replace('Sábado-feira', 'Sábado').replace('Domingo-feira', 'Domingo')
      : WEEKDAYS_SHORT[date.getDay()];
  }

  teacherName(session: ClassSession): string {
    if (!this.data) return '';
    if (session.teacherId === this.data.user.uid) return `Prof. ${this.data.user.name}`;
    const teacher = this.data.members.find((member) => member.uid === session.teacherId);
    return teacher ? `Prof. ${teacher.name}` : '';
  }

  classLevel(session: ClassSession): string {
    return this.data?.classes.find((item) => item.id === session.classId)?.level || 'Todos';
  }

  validationCode(session: ClassSession): string {
    const value = (hashText(`${session.id}:${this.data?.user.uid ?? ''}`) % 9000) + 1000;
    return `CAV - ${value}`;
  }

  qrCells(session: ClassSession): boolean[] {
    const size = 21;
    let seed = hashText(`${session.id}:${this.data?.user.uid ?? ''}`) || 1;
    const cells: boolean[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const finder = [
          [0, 0],
          [0, size - 7],
          [size - 7, 0],
        ].find(([top, left]) => row >= top && row < top + 7 && column >= left && column < left + 7);
        if (finder) {
          const localRow = row - finder[0];
          const localColumn = column - finder[1];
          const ring = Math.min(localRow, localColumn, 6 - localRow, 6 - localColumn);
          cells.push(ring !== 1);
          continue;
        }
        if ((row < 8 && (column < 8 || column >= size - 8)) || (row >= size - 8 && column < 8)) {
          cells.push(false);
          continue;
        }
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        cells.push((seed >>> 0) % 2 === 0);
      }
    }
    return cells;
  }

  get trailBelts(): TrailBelt[] {
    const configured = (this.data?.belts ?? []).filter((belt) => belt.active).sort((a, b) => a.order - b.order);
    const source = configured.length
      ? configured.map((belt) => {
          const fallback = DEFAULT_BELTS.find((item) => normalizeName(item.name) === normalizeName(belt.name));
          return {
            id: belt.id,
            name: belt.name,
            color: belt.colorHex,
            description: fallback?.description ?? '',
            total: belt.minClasses || 12,
          };
        })
      : DEFAULT_BELTS.map((belt) => ({ ...belt, id: '', total: 12 }));
    const profile = this.data?.profile;
    let currentIndex = source.findIndex(
      (belt) =>
        (belt.id && belt.id === profile?.beltId) || normalizeName(belt.name) === normalizeName(profile?.beltName ?? ''),
    );
    if (currentIndex < 0) currentIndex = 0;
    return source.map((belt, index) => ({
      name: belt.name.replace(/^faixa/i, 'Faixa'),
      color: belt.color,
      description: belt.description,
      total: index === currentIndex ? this.checkpoints.total : belt.total,
      status: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'locked',
    }));
  }

  get checkpoints(): { done: number; total: number } {
    const profile = this.data?.profile;
    if (!profile) return { done: 0, total: 10 };
    const criteria = this.data?.belts.find((belt) => belt.id === profile.beltId);
    if (criteria?.minClasses)
      return { done: Math.min(profile.totalClasses, criteria.minClasses), total: criteria.minClasses };
    return { done: profile.stripes, total: 4 };
  }

  get checkpointPercent(): number {
    const { done, total } = this.checkpoints;
    return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }

  get myAttendances(): AcademyData['attendances'] {
    const uid = this.data?.user.uid;
    return (this.data?.attendances ?? []).filter((attendance) => attendance.userId === uid);
  }

  get weekStreak(): number {
    const weekKey = (date: Date): string => {
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return localDateKey(monday);
    };
    const weeks = new Set(this.myAttendances.map((attendance) => weekKey(parseDateKey(attendance.sessionDate))));
    const cursor = new Date();
    if (!weeks.has(weekKey(cursor))) cursor.setDate(cursor.getDate() - 7);
    let streak = 0;
    while (weeks.has(weekKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
  }

  async saveProfileName(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.updateUserName(this.data!.user.uid, this.editName);
      await this.refresh();
    }, 'Perfil atualizado.');
  }

  retryAuth(): void {
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = undefined;
    this.watchAuth();
  }

  get isStaff(): boolean {
    return this.data?.user.role !== 'student';
  }

  get isAdmin(): boolean {
    return this.data?.user.role === 'admin';
  }

  get studentCount(): number {
    return this.data?.members.filter((member) => member.role === 'student').length ?? 0;
  }

  get userInitials(): string {
    return (this.data?.user.name ?? '')
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();
  }

  get visibleAnnouncements(): Announcement[] {
    return (this.data?.announcements ?? []).filter(
      (item) =>
        item.active &&
        (item.audience === 'all' ||
          (item.audience === 'students' && !this.isStaff) ||
          (item.audience === 'staff' && this.isStaff)),
    );
  }

  get upcomingSessions(): ClassSession[] {
    const today = new Date().toISOString().slice(0, 10);
    return (this.data?.sessions ?? [])
      .filter((session) => session.status === 'open' && session.date >= today)
      .sort((first, second) => `${first.date} ${first.startTime}`.localeCompare(`${second.date} ${second.startTime}`))
      .slice(0, 3);
  }

  get promotionEligible(): boolean {
    return this.isEligible(this.data?.profile);
  }

  isEligible(profile: StudentProfile | undefined): boolean {
    const criteria = this.data?.belts.find((belt) => belt.id === profile?.beltId);
    if (!profile || !criteria || (!criteria.minMonths && !criteria.minClasses && !criteria.minMatMinutes)) return false;
    if (profile.stripes >= 4) {
      const currentOrder = this.data?.belts.find((belt) => belt.id === profile.beltId)?.order;
      if (currentOrder === undefined || !this.data?.belts.some((belt) => belt.active && belt.order > currentOrder))
        return false;
    }
    const months = Math.max(0, (Date.now() - new Date(profile.startDate).getTime()) / (30.4375 * 24 * 60 * 60 * 1000));
    return (
      months >= criteria.minMonths &&
      profile.totalClasses >= criteria.minClasses &&
      profile.totalMatMinutes >= criteria.minMatMinutes
    );
  }

  beltColor(profile: StudentProfile): string {
    return this.data?.belts.find((belt) => belt.id === profile.beltId)?.colorHex ?? '#e7e7e7';
  }

  hasBeltCriteria(profile: StudentProfile): boolean {
    return this.data?.belts.some((belt) => belt.id === profile.beltId) ?? false;
  }

  isPresent(session: ClassSession, userId: string): boolean {
    return (
      this.data?.attendances.some(
        (attendance) => attendance.sessionId === session.id && attendance.userId === userId,
      ) ?? false
    );
  }

  get paymentsWithCurrentStatus(): Payment[] {
    const today = new Date().toISOString().slice(0, 10);
    return (this.data?.payments ?? []).map((payment) =>
      payment.status === 'pending' && payment.dueDate < today ? { ...payment, status: 'overdue' } : payment,
    );
  }

  async submitAuth(): Promise<void> {
    this.error = '';
    this.notice = '';
    this.saving = true;
    try {
      if (this.authMode === 'login') {
        const authRequestId = this.authRequestId;
        const user = await this.academy.signIn(this.authForm.email, this.authForm.password);
        if (authRequestId === this.authRequestId) await this.onAuthChanged(user);
      } else if (this.authMode === 'academy') await this.academy.createAcademyAccount(this.authForm);
      else
        await this.academy.joinAcademy({
          ...this.authForm,
          declaredBeltName: this.graduated && this.declaredBelt ? this.declaredBelt : undefined,
        });
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }

  async logout(): Promise<void> {
    await this.academy.signOut();
    this.data = null;
    this.section = 'overview';
    this.goToAuth('welcome');
  }

  async refresh(): Promise<void> {
    const uid = this.data?.user.uid;
    if (uid) this.data = await this.academy.loadAcademyData(uid);
  }

  async checkIn(session: ClassSession): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.checkIn({ session, user: this.data!.user });
      await this.refresh();
    }, 'Presença confirmada! Seu tempo de tatame foi atualizado.');
  }

  async recordSessionAttendance(session: ClassSession, member: AcademyUser): Promise<void> {
    const profile = this.profileFor(member.uid);
    if (!profile) return;
    await this.perform(async () => {
      await this.academy.recordAttendance({ session, member });
      await this.refresh();
    }, `Presença lançada para ${member.name}.`);
  }

  async createClass(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      const input: Omit<AcademyClass, 'id'> = {
        ...this.classForm,
        gymId: this.data!.user.gymId,
        teacherId: this.data!.user.uid,
        active: true,
      };
      await this.academy.createClass(input);
      this.classForm = { name: '', modality: 'Jiu-jitsu', level: 'Todos', startTime: '19:00', endTime: '20:30' };
      await this.refresh();
    }, 'Turma criada.');
  }

  async createSession(): Promise<void> {
    if (!this.data) return;
    const selected = this.data.classes.find((item) => item.id === this.sessionForm.classId);
    if (!selected) return this.showError('Cadastre ou selecione uma turma antes de abrir a aula.');
    await this.perform(async () => {
      await this.academy.createSession({
        gymId: this.data!.user.gymId,
        classId: selected.id,
        className: selected.name,
        teacherId: this.data!.user.uid,
        date: this.sessionForm.date,
        startTime: this.sessionForm.startTime,
        endTime: this.sessionForm.endTime,
      });
      await this.refresh();
    }, 'Aula aberta para check-in.');
  }

  async closeSession(session: ClassSession): Promise<void> {
    await this.perform(async () => {
      await this.academy.closeSession(session.id);
      await this.refresh();
    }, 'Chamada encerrada.');
  }

  async publishAnnouncement(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.publishAnnouncement({
        ...this.announcementForm,
        gymId: this.data!.user.gymId,
        authorId: this.data!.user.uid,
      });
      this.announcementForm = { title: '', message: '', audience: 'all' };
      await this.refresh();
    }, 'Comunicado publicado no aplicativo.');
  }

  async publishVideo(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.publishTrainingVideo({
        ...this.videoForm,
        gymId: this.data!.user.gymId,
        authorId: this.data!.user.uid,
      });
      this.videoForm = { title: '', description: '', url: '' };
      await this.refresh();
    }, 'Videoaula publicada.');
  }

  async updateMemberRole(member: AcademyUser, role: string): Promise<void> {
    if (role !== 'student' && role !== 'teacher') return;
    await this.perform(async () => {
      await this.academy.updateMemberRole(member.uid, role);
      await this.refresh();
    }, 'Perfil atualizado.');
  }

  async createProduct(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.createProduct({
        ...this.productForm,
        price: Math.round(this.productForm.price * 100),
        gymId: this.data!.user.gymId,
        active: true,
      });
      this.productForm = { name: '', category: 'Kimono', price: 0, stock: 0 };
      await this.refresh();
    }, 'Produto adicionado à loja.');
  }

  async requestOrder(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.requestOrder(this.data!.user, this.data!.products, this.quantities);
      this.quantities = {};
      await this.refresh();
    }, 'Pedido enviado para a academia confirmar.');
  }

  async createPayment(): Promise<void> {
    if (!this.data) return;
    const member = this.data.members.find((item) => item.uid === this.paymentForm.userId);
    if (!member) return this.showError('Selecione um aluno.');
    await this.perform(async () => {
      await this.academy.createPayment({
        gymId: this.data!.user.gymId,
        userId: member.uid,
        studentName: member.name,
        referenceMonth: this.paymentForm.referenceMonth,
        dueDate: this.paymentForm.dueDate,
        amount: Math.round(this.paymentForm.amount * 100),
        method: this.paymentForm.method,
      });
      await this.refresh();
    }, 'Mensalidade lançada.');
  }

  async markPaid(payment: Payment): Promise<void> {
    await this.perform(async () => {
      await this.academy.markPaymentPaid(payment);
      await this.refresh();
    }, 'Pagamento atualizado.');
  }

  async createBeltCriteria(): Promise<void> {
    if (!this.data) return;
    await this.perform(async () => {
      await this.academy.createBelt({ ...this.beltForm, gymId: this.data!.user.gymId, active: true });
      this.beltForm = {
        name: '',
        order: (this.data?.belts.length ?? 0) + 1,
        colorHex: '#d8d8d8',
        minMonths: 0,
        minClasses: 0,
        minMatMinutes: 0,
      };
      await this.refresh();
    }, 'Critérios de graduação salvos.');
  }

  async awardGraduation(member: AcademyUser, profile: StudentProfile): Promise<void> {
    const nextBelt =
      profile.stripes >= 4
        ? this.data?.belts
            .filter(
              (belt) =>
                belt.active && belt.order > (this.data?.belts.find((item) => item.id === profile.beltId)?.order ?? -1),
            )
            .sort((a, b) => a.order - b.order)[0]
        : undefined;
    await this.perform(async () => {
      await this.academy.awardNextGraduation(
        member,
        profile,
        'Critérios de tempo de tatame e frequência atingidos.',
        nextBelt,
      );
      await this.refresh();
    }, 'Graduação registrada no histórico.');
  }

  profileFor(uid: string): StudentProfile | undefined {
    return this.data?.profiles.find((profile) => profile.userId === uid);
  }

  attendanceFor(session: ClassSession): number {
    return this.data?.attendances.filter((attendance) => attendance.sessionId === session.id).length ?? 0;
  }

  formatMoney(cents: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  }

  formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? `${hours}h ${remainder}min` : `${remainder}min`;
  }

  private async onAuthChanged(user: User | null): Promise<void> {
    const requestId = ++this.authRequestId;
    this.loading = true;
    this.error = '';
    this.changeDetector.markForCheck();
    if (!user) {
      this.data = null;
      this.loading = false;
      this.changeDetector.markForCheck();
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        this.academy.loadAcademyData(user.uid),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('A conexão com sua academia demorou demais. Verifique a internet e tente novamente.')),
            ACADEMY_DATA_TIMEOUT_MS,
          );
        }),
      ]);
      if (requestId === this.authRequestId) this.data = data;
    } catch (error) {
      if (requestId === this.authRequestId) {
        this.authTimedOut =
          error instanceof Error && error.message.startsWith('A conexão com sua academia demorou demais.');
        this.error = this.errorMessage(error);
        this.data = null;
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      if (requestId === this.authRequestId) {
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  private watchAuth(): void {
    this.loading = true;
    this.authTimedOut = false;
    this.error = '';
    this.authTimeout = setTimeout(() => {
      this.authTimeout = undefined;
      this.authTimedOut = true;
      this.loading = false;
      this.error = 'Não foi possível conectar à autenticação. Verifique sua internet e tente novamente.';
      this.changeDetector.markForCheck();
    }, AUTH_INITIALIZATION_TIMEOUT_MS);
    try {
      this.unsubscribeAuth = this.academy.watchAuth(
        (user) => {
          this.clearAuthTimeout();
          this.authTimedOut = false;
          this.changeDetector.markForCheck();
          void this.onAuthChanged(user);
        },
        () => {
          this.clearAuthTimeout();
          this.authTimedOut = true;
          this.loading = false;
          this.data = null;
          this.error = 'Não foi possível conectar à autenticação. Verifique sua internet e tente novamente.';
          this.changeDetector.markForCheck();
        },
      );
    } catch (error) {
      this.clearAuthTimeout();
      this.authTimedOut = true;
      this.loading = false;
      this.data = null;
      this.error = this.errorMessage(error);
      this.changeDetector.markForCheck();
    }
  }

  private clearAuthTimeout(): void {
    if (this.authTimeout) clearTimeout(this.authTimeout);
    this.authTimeout = undefined;
  }

  private async perform(action: () => Promise<void>, success: string): Promise<void> {
    this.error = '';
    this.notice = '';
    this.saving = true;
    try {
      await action();
      this.notice = success;
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.saving = false;
    }
  }

  private showError(message: string): void {
    this.error = message;
    this.notice = '';
  }

  private readStoredLocation(): string {
    try {
      return localStorage.getItem(LOCATION_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private errorMessage(error: unknown): string {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const messages: Record<string, string> = {
      'auth/email-already-in-use': 'Este e-mail já possui cadastro.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/weak-password': 'A senha precisa ter no mínimo 8 caracteres, com letras e números.',
      'auth/missing-email': 'Informe o e-mail da sua conta.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      'auth/invalid-email': 'Informe um e-mail válido.',
      'permission-denied':
        'Sua conta foi autenticada, mas o Firestore recusou o acesso. Verifique se seu perfil está ativo e vinculado à academia e se as regras do Firestore foram publicadas.',
      unavailable: 'Sem conexão com o serviço. Tente novamente.',
    };
    return messages[code] ?? (error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
  }
}
