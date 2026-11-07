export type UserRole = 'student' | 'teacher' | 'admin';

export interface AcademyUser {
  uid: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string;
  role: UserRole;
  gymId: string;
  status: 'active' | 'inactive';
}

export interface StudentProfile {
  userId: string;
  gymId: string;
  beltId: string;
  beltName: string;
  stripes: number;
  startDate: string;
  totalClasses: number;
  totalMatMinutes: number;
  lastCheckInAt?: unknown;
  financialStatus: 'current' | 'pending' | 'overdue';
  planId: string;
  declaredBeltName?: string;
}

export interface Belt {
  id: string;
  gymId: string;
  name: string;
  order: number;
  colorHex: string;
  minMonths: number;
  minClasses: number;
  minMatMinutes: number;
  active: boolean;
}

export interface AcademyClass {
  id: string;
  gymId: string;
  name: string;
  modality: string;
  level: string;
  teacherId: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

export interface ClassSession {
  id: string;
  gymId: string;
  classId: string;
  className: string;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'open' | 'closed';
}

export interface Attendance {
  id: string;
  gymId: string;
  sessionId: string;
  userId: string;
  studentName: string;
  sessionDate: string;
  checkInAt?: unknown;
  status: 'present' | 'excused';
  confirmedBy: string;
  minutes: number;
  source: 'self' | 'teacher';
}

export interface Graduation {
  id: string;
  gymId: string;
  userId: string;
  beltName: string;
  type: 'stripe' | 'belt';
  stripes: number;
  awardedBy: string;
  awardedAt: string;
  reason: string;
}

export interface Payment {
  id: string;
  gymId: string;
  userId: string;
  studentName: string;
  referenceMonth: string;
  dueDate: string;
  paidAt?: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  method: string;
}

export interface Announcement {
  id: string;
  gymId: string;
  title: string;
  message: string;
  authorId: string;
  audience: 'all' | 'students' | 'staff';
  publishedAt?: string;
  active: boolean;
}

export interface TrainingVideo {
  id: string;
  gymId: string;
  title: string;
  description: string;
  url: string;
  authorId: string;
  createdAt: string;
  active: boolean;
}

export interface Product {
  id: string;
  gymId: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
}

export interface StoreOrder {
  id: string;
  gymId: string;
  userId: string;
  status: 'requested' | 'accepted' | 'cancelled';
  total: number;
  createdAt?: unknown;
  items: { productId: string; name: string; price: number; quantity: number }[];
}

export interface AcademyData {
  user: AcademyUser;
  gymName: string;
  gymAddress: string;
  profile: StudentProfile;
  profiles: StudentProfile[];
  belts: Belt[];
  classes: AcademyClass[];
  sessions: ClassSession[];
  attendances: Attendance[];
  graduations: Graduation[];
  payments: Payment[];
  announcements: Announcement[];
  trainingVideos: TrainingVideo[];
  products: Product[];
  orders: StoreOrder[];
  members: AcademyUser[];
}
