import { Injectable } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  type DocumentData,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  type QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { firebaseApp } from './firebase';
import type {
  AcademyClass,
  AcademyData,
  AcademyUser,
  Announcement,
  Attendance,
  Belt,
  ClassSession,
  Payment,
  Product,
  StudentProfile,
  StoreOrder,
  Graduation,
  TrainingVideo,
} from './models';

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

@Injectable({ providedIn: 'root' })
export class AcademyService {
  watchAuth(callback: (user: User | null) => void, onError?: (error: Error) => void): () => void {
    return onAuthStateChanged(auth, callback, onError);
  }

  async signIn(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  }

  async signOut(): Promise<void> {
    await signOut(auth);
  }

  async sendPasswordReset(email: string): Promise<void> {
    auth.languageCode = 'pt-BR';
    await sendPasswordResetEmail(auth, email.trim());
  }

  async updateUserName(uid: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Informe seu nome.');
    await updateDoc(doc(db, 'users', uid), { name: trimmed });
    if (auth.currentUser?.uid === uid) await updateProfile(auth.currentUser, { displayName: trimmed });
  }

  async createAcademyAccount(input: {
    name: string;
    email: string;
    password: string;
    gymName: string;
    address: string;
  }): Promise<void> {
    const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await updateProfile(credential.user, { displayName: input.name.trim() });
    const gymRef = doc(collection(db, 'gyms'));
    const batch = writeBatch(db);
    batch.set(gymRef, {
      name: input.gymName.trim(),
      address: input.address.trim(),
      logoUrl: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      active: true,
      ownerId: credential.user.uid,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', credential.user.uid), this.userRecord(credential.user, input.name, gymRef.id, 'admin'));
    batch.set(doc(db, 'student_profiles', credential.user.uid), this.newProfile(credential.user.uid, gymRef.id));
    try {
      await batch.commit();
    } catch (error) {
      await deleteUser(credential.user);
      throw error;
    }
  }

  async joinAcademy(input: {
    name: string;
    email: string;
    password: string;
    gymId: string;
    declaredBeltName?: string;
  }): Promise<void> {
    const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await updateProfile(credential.user, { displayName: input.name.trim() });
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'users', credential.user.uid),
      this.userRecord(credential.user, input.name, input.gymId.trim(), 'student'),
    );
    batch.set(doc(db, 'student_profiles', credential.user.uid), {
      ...this.newProfile(credential.user.uid, input.gymId.trim()),
      ...(input.declaredBeltName ? { declaredBeltName: input.declaredBeltName } : {}),
    });
    try {
      await batch.commit();
    } catch (error) {
      await deleteUser(credential.user);
      throw error;
    }
  }

  async loadAcademyData(uid: string): Promise<AcademyData> {
    const userSnapshot = await getDoc(doc(db, 'users', uid));
    if (!userSnapshot.exists()) throw new Error('Seu cadastro ainda não foi associado a uma academia.');
    const user = { uid, ...userSnapshot.data() } as AcademyUser;
    const [
      gymSnapshot,
      profileSnapshot,
      classes,
      sessions,
      attendances,
      graduations,
      payments,
      announcements,
      trainingVideos,
      products,
      orders,
      members,
      profiles,
      belts,
    ] = await Promise.all([
      getDoc(doc(db, 'gyms', user.gymId)),
      getDoc(doc(db, 'student_profiles', uid)),
      this.list<AcademyClass>('classes', user.gymId),
      this.listSessions(user.gymId),
      this.listAll<Attendance>('attendances', user.gymId, user.role === 'student' ? ['userId', uid] : undefined),
      this.list<Graduation>('graduations', user.gymId, user.role === 'student' ? ['userId', uid] : undefined),
      this.list<Payment>('payments', user.gymId, user.role === 'student' ? ['userId', uid] : undefined),
      this.listAnnouncements(user.gymId, user.role),
      this.list<TrainingVideo>('training_videos', user.gymId),
      this.list<Product>('products', user.gymId),
      this.list<StoreOrder>('orders', user.gymId, user.role === 'student' ? ['userId', uid] : undefined),
      user.role === 'student' ? Promise.resolve([] as AcademyUser[]) : this.listUsers(user.gymId),
      user.role === 'student'
        ? Promise.resolve([] as StudentProfile[])
        : this.listAll<StudentProfile>('student_profiles', user.gymId),
      this.list<Belt>('belts', user.gymId),
    ]);
    const storedProfiles =
      user.role === 'student'
        ? profileSnapshot.exists()
          ? [{ userId: uid, ...profileSnapshot.data() } as StudentProfile]
          : []
        : profiles;
    const attendanceTotals = attendances.reduce<Record<string, { classes: number; minutes: number }>>(
      (totals, attendance) => {
        const current = totals[attendance.userId] ?? { classes: 0, minutes: 0 };
        current.classes += 1;
        current.minutes += attendance.minutes;
        totals[attendance.userId] = current;
        return totals;
      },
      {},
    );
    const calculatedProfiles = storedProfiles.map((studentProfile) => ({
      ...studentProfile,
      totalClasses: attendanceTotals[studentProfile.userId]?.classes ?? 0,
      totalMatMinutes: attendanceTotals[studentProfile.userId]?.minutes ?? 0,
    }));
    const profile =
      calculatedProfiles.find((studentProfile) => studentProfile.userId === uid) ??
      (profileSnapshot.exists()
        ? ({ userId: uid, ...profileSnapshot.data() } as StudentProfile)
        : this.newProfile(uid, user.gymId));
    const today = new Date().toISOString().slice(0, 10);
    const paymentsWithStatus = (payments as Payment[]).map((payment) =>
      payment.status === 'pending' && payment.dueDate < today ? { ...payment, status: 'overdue' as const } : payment,
    );
    profile.financialStatus = paymentsWithStatus.some((payment) => payment.status === 'overdue')
      ? 'overdue'
      : paymentsWithStatus.some((payment) => payment.status === 'pending')
        ? 'pending'
        : 'current';
    const gymName = gymSnapshot.exists() ? String(gymSnapshot.data()['name'] ?? 'Academia') : 'Academia';
    const gymAddress = gymSnapshot.exists() ? String(gymSnapshot.data()['address'] ?? '') : '';
    return {
      user,
      gymName,
      gymAddress,
      profile,
      profiles: calculatedProfiles,
      belts,
      classes,
      sessions,
      attendances,
      graduations,
      payments: paymentsWithStatus,
      announcements,
      trainingVideos,
      products,
      orders,
      members,
    };
  }

  async createClass(input: Omit<AcademyData['classes'][number], 'id'>): Promise<void> {
    await addDoc(collection(db, 'classes'), input);
  }

  async createBelt(input: Omit<Belt, 'id'>): Promise<void> {
    const beltId = input.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    await setDoc(doc(db, 'belts', `${input.gymId}_${beltId}`), input);
  }

  async createSession(input: {
    gymId: string;
    classId: string;
    className: string;
    teacherId: string;
    date: string;
    startTime: string;
    endTime: string;
  }): Promise<void> {
    if (input.endTime <= input.startTime) throw new Error('O horário de encerramento deve ser posterior ao início.');
    await addDoc(collection(db, 'class_sessions'), { ...input, status: 'open' });
  }

  async closeSession(sessionId: string): Promise<void> {
    await setDoc(doc(db, 'class_sessions', sessionId), { status: 'closed' }, { merge: true });
  }

  async checkIn(input: { session: AcademyData['sessions'][number]; user: AcademyUser }): Promise<void> {
    if (input.session.status !== 'open') throw new Error('Esta aula já foi encerrada.');
    const attendanceRef = doc(db, 'attendances', `${input.session.id}_${input.user.uid}`);
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(`${input.session.date}T${input.session.endTime}`).getTime() -
          new Date(`${input.session.date}T${input.session.startTime}`).getTime()) /
          60_000,
      ),
    );
    await runTransaction(db, async (transaction) => {
      const attendance = await transaction.get(attendanceRef);
      if (attendance.exists()) throw new Error('Seu check-in nesta aula já foi registrado.');
      transaction.set(attendanceRef, {
        gymId: input.user.gymId,
        sessionId: input.session.id,
        userId: input.user.uid,
        studentName: input.user.name,
        classId: input.session.classId,
        sessionDate: input.session.date,
        checkInAt: serverTimestamp(),
        status: 'present',
        confirmedBy: input.user.uid,
        confirmedAt: serverTimestamp(),
        minutes,
        source: 'self',
      });
    });
  }

  async recordAttendance(input: { session: AcademyData['sessions'][number]; member: AcademyUser }): Promise<void> {
    const ref = doc(db, 'attendances', `${input.session.id}_${input.member.uid}`);
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(`${input.session.date}T${input.session.endTime}`).getTime() -
          new Date(`${input.session.date}T${input.session.startTime}`).getTime()) /
          60_000,
      ),
    );
    await runTransaction(db, async (transaction) => {
      const attendance = await transaction.get(ref);
      if (attendance.exists()) throw new Error('Este aluno já está na lista de presença.');
      transaction.set(ref, {
        gymId: input.member.gymId,
        sessionId: input.session.id,
        userId: input.member.uid,
        studentName: input.member.name,
        classId: input.session.classId,
        sessionDate: input.session.date,
        checkInAt: serverTimestamp(),
        status: 'present',
        confirmedBy: auth.currentUser?.uid,
        confirmedAt: serverTimestamp(),
        minutes,
        source: 'teacher',
      });
    });
  }

  async publishAnnouncement(input: Omit<Announcement, 'id' | 'publishedAt' | 'active'>): Promise<void> {
    await addDoc(collection(db, 'announcements'), { ...input, publishedAt: new Date().toISOString(), active: true });
  }

  async publishTrainingVideo(input: Omit<TrainingVideo, 'id' | 'createdAt' | 'active'>): Promise<void> {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new Error('Informe um link válido para a videoaula.');
    }
    if (url.protocol !== 'https:') throw new Error('O link da videoaula deve usar HTTPS.');
    await addDoc(collection(db, 'training_videos'), { ...input, createdAt: new Date().toISOString(), active: true });
  }

  async updateMemberRole(uid: string, role: 'student' | 'teacher'): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { role });
  }

  async createProduct(input: Omit<Product, 'id'>): Promise<void> {
    await addDoc(collection(db, 'products'), input);
  }

  async requestOrder(user: AcademyUser, products: Product[], quantities: Record<string, number>): Promise<void> {
    const items = products
      .filter((product) => (quantities[product.id] ?? 0) > 0)
      .map((product) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: quantities[product.id],
      }));
    if (!items.length) throw new Error('Escolha ao menos um produto.');
    for (const item of items) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product?.active || item.quantity > product.stock) throw new Error(`Estoque insuficiente para ${item.name}.`);
    }
    const order: StoreOrder = {
      id: doc(collection(db, 'orders')).id,
      gymId: user.gymId,
      userId: user.uid,
      status: 'requested',
      total: items.reduce((total, item) => total + item.price * item.quantity, 0),
      items,
    };
    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', order.id), { ...order, createdAt: serverTimestamp() });
    for (const item of items)
      batch.set(doc(collection(db, 'order_items')), {
        gymId: user.gymId,
        userId: user.uid,
        orderId: order.id,
        ...item,
        subtotal: item.price * item.quantity,
      });
    await batch.commit();
  }

  async createPayment(input: Omit<Payment, 'id' | 'status'>): Promise<void> {
    await addDoc(collection(db, 'payments'), { ...input, status: 'pending' });
  }

  async markPaymentPaid(payment: Payment): Promise<void> {
    await setDoc(doc(db, 'payments', payment.id), { ...payment, status: 'paid', paidAt: new Date().toISOString() });
  }

  async awardNextGraduation(
    member: AcademyUser,
    profile: StudentProfile,
    reason: string,
    nextBelt?: Belt,
  ): Promise<void> {
    const isBeltPromotion = profile.stripes >= 4;
    if (isBeltPromotion && !nextBelt) throw new Error('Cadastre a próxima faixa antes de promover este aluno.');
    const stripes = isBeltPromotion ? 0 : profile.stripes + 1;
    const beltName = isBeltPromotion ? nextBelt!.name : profile.beltName;
    const batch = writeBatch(db);
    const graduationRef = doc(collection(db, 'graduations'));
    batch.set(graduationRef, {
      gymId: member.gymId,
      userId: member.uid,
      beltName,
      type: isBeltPromotion ? 'belt' : 'stripe',
      stripes,
      awardedBy: auth.currentUser?.uid,
      awardedAt: new Date().toISOString(),
      reason: reason.trim(),
    });
    batch.set(
      doc(db, 'student_profiles', member.uid),
      {
        stripes,
        ...(isBeltPromotion
          ? {
              beltId: `${member.gymId}_${nextBelt!.name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')}`,
              beltName,
              startDate: new Date().toISOString(),
            }
          : {}),
      },
      { merge: true },
    );
    await batch.commit();
  }

  private userRecord(user: User, name: string, gymId: string, role: AcademyUser['role']): Omit<AcademyUser, 'uid'> {
    return { name: name.trim(), email: user.email ?? '', phone: '', photoUrl: '', role, gymId, status: 'active' };
  }

  private newProfile(userId: string, gymId: string): StudentProfile {
    return {
      userId,
      gymId,
      beltId: `${gymId}_faixa-branca`,
      beltName: 'Faixa branca',
      stripes: 0,
      startDate: new Date().toISOString(),
      totalClasses: 0,
      totalMatMinutes: 0,
      financialStatus: 'current',
      planId: '',
    };
  }

  private async list<T>(name: string, gymId: string, filter?: [string, string]): Promise<T[]> {
    const constraints = [where('gymId', '==', gymId)];
    if (filter) constraints.push(where(filter[0], '==', filter[1]));
    const snapshots = await getDocs(query(collection(db, name), ...constraints, limit(100)));
    return snapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T);
  }

  private async listAll<T>(name: string, gymId: string, filter?: [string, string]): Promise<T[]> {
    const constraints = [where('gymId', '==', gymId)];
    if (filter) constraints.push(where(filter[0], '==', filter[1]));
    const items: T[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
    let pageSize = 0;
    do {
      const page = cursor
        ? query(collection(db, name), ...constraints, startAfter(cursor), limit(200))
        : query(collection(db, name), ...constraints, limit(200));
      const snapshots = await getDocs(page);
      items.push(...snapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T));
      pageSize = snapshots.size;
      cursor = snapshots.docs.at(-1);
    } while (pageSize === 200);
    return items;
  }

  private async listUsers(gymId: string): Promise<AcademyUser[]> {
    const users = await this.listAll<Omit<AcademyUser, 'uid'> & { id: string }>('users', gymId);
    return users.map(({ id, ...user }) => ({ uid: id, ...user }) as AcademyUser);
  }

  private async listSessions(gymId: string): Promise<ClassSession[]> {
    const snapshots = await getDocs(query(collection(db, 'class_sessions'), where('gymId', '==', gymId)));
    return snapshots.docs
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as ClassSession)
      .sort((first, second) => second.date.localeCompare(first.date))
      .slice(0, 100);
  }

  private async listAnnouncements(gymId: string, role: AcademyUser['role']): Promise<Announcement[]> {
    const audiences = role === 'student' ? ['all', 'students'] : ['all', 'students', 'staff'];
    const snapshots = await getDocs(
      query(
        collection(db, 'announcements'),
        where('gymId', '==', gymId),
        where('audience', 'in', audiences),
        limit(100),
      ),
    );
    return snapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Announcement);
  }
}
