import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { User } from 'firebase/auth';
import { afterEach, vi } from 'vitest';

import { AcademyService } from '../../core/academy.service';
import type { AcademyData } from '../../core/models';

import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let authCallback: ((user: User | null) => void) | undefined;
  let loadAcademyData: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    authCallback = undefined;
    loadAcademyData = vi.fn(() => new Promise<never>(() => undefined));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AcademyService,
          useValue: {
            signIn: vi.fn(),
            watchAuth: (callback: (user: User | null) => void) => {
              authCallback = callback;
              return () => undefined;
            },
            loadAcademyData,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('walks from the welcome screen through onboarding to registration', () => {
    authCallback?.(null);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Caverna Jiu-Jitsu');
    expect(element.textContent).toContain('Já tenho conta');
    (element.querySelector('.auth-welcome .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.authStep).toBe('onboarding');
    expect(element.textContent).toContain('Avançar');
    (element.querySelector('.onboarding .btn-text') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.authStep).toBe('register');
    expect(component.authMode).toBe('student');
    expect(element.textContent).toContain('Vamos começar sua jornada na Caverna');
  });

  it('asks for the belt after valid registration data and validates the password rule', () => {
    authCallback?.(null);
    component.startRegistration();
    component.authForm = { ...component.authForm, name: 'Gabriel', email: 'g@x.com', password: 'curta', gymId: 'gym' };
    component.continueRegistration();
    expect(component.authStep).toBe('register');
    expect(component.error).toContain('8 caracteres');

    component.authForm.password = 'senhaforte1';
    component.continueRegistration();
    expect(component.authStep).toBe('belt-question');

    component.graduated = true;
    component.continueBeltQuestion();
    expect(component.authStep).toBe('belt-select');
  });

  it('loads the account after a successful sign-in even if the auth observer does not emit again', async () => {
    const user = { uid: 'user-1' } as User;
    const account = { user: { uid: user.uid } } as AcademyData;
    const academy = TestBed.inject(AcademyService);
    vi.mocked(academy.signIn).mockResolvedValue(user);
    loadAcademyData.mockResolvedValue(account);
    authCallback?.(null);
    component.authStep = 'login';
    component.authForm = { ...component.authForm, email: 'athlete@example.com', password: 'valid-password' };

    await component.submitAuth();

    expect(academy.signIn).toHaveBeenCalledWith('athlete@example.com', 'valid-password');
    expect(loadAcademyData).toHaveBeenCalledWith(user.uid);
    expect(component.data).toBe(account);
    expect(component.loading).toBe(false);
  });

  it('explains how to resolve a Firestore permission error after authentication', async () => {
    loadAcademyData.mockRejectedValue({ code: 'permission-denied' });
    authCallback?.({ uid: 'user-1' } as User);
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();

    expect(component.error).toContain('Sua conta foi autenticada');
    expect(component.error).toContain('perfil está ativo e vinculado à academia');
    expect(fixture.nativeElement.textContent).toContain('regras do Firestore foram publicadas');
  });

  it('ends the startup loading state when Firebase does not emit an auth state', async () => {
    await vi.advanceTimersByTimeAsync(15000);
    await fixture.whenStable();

    expect(authCallback).toBeDefined();
    expect(component.loading).toBe(false);
    expect(component.authTimedOut).toBe(true);
    expect(component.error).toContain('Não foi possível conectar à autenticação');
    expect(fixture.nativeElement.querySelector('.loading-screen')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível conectar à autenticação');
  });

  it('ends the startup loading state when loading academy data times out', async () => {
    authCallback?.({ uid: 'user-1' } as User);
    await vi.advanceTimersByTimeAsync(15000);
    await vi.advanceTimersByTimeAsync(20);
    await fixture.whenStable();

    expect(loadAcademyData).toHaveBeenCalledWith('user-1');
    expect(component.loading).toBe(false);
    expect(component.error).toContain('A conexão com sua academia demorou demais');
    expect(fixture.nativeElement.querySelector('.loading-screen')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('A conexão com sua academia demorou demais');
  });
});
