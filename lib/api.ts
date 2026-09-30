const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// ── Response Types ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string | null;
  bio?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
  notifEmail?: boolean;
  notifPush?: boolean;
  notifAssignment?: boolean;
  notifGrade?: boolean;
  notifNewCourse?: boolean;
  privacyProfile?: boolean;
  privacyActivity?: boolean;
  emailVerified?: boolean;
}

export interface AuthTokenResponse {
  token: string;
  user: User;
}

// ── Courses ───────────────────────────────────────────────────────────────────

export interface Course {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  trailerUrl?: string;
  teacherId: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateCourseData = Pick<Course, 'title' | 'description'> & {
  thumbnail?: string;
  trailerUrl?: string;
};
export type UpdateCourseData = Partial<CreateCourseData & { isPublished: boolean }>;

// ── Enrollment Requests ───────────────────────────────────────────────────────

export type EnrollmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface EnrollmentRequest {
  id: string;
  userId: string;
  courseId: string;
  status: EnrollmentRequestStatus;
  adminNote?: string | null;
  requestedAt?: string;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
  course?: Pick<Course, 'id' | 'title' | 'thumbnail'> & {
    teacher?: Pick<User, 'id' | 'name'>;
  };
}

export interface EnrollmentRequestStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

// ── Modules ───────────────────────────────────────────────────────────────────

export interface Module {
  id: string;
  courseId: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateModuleData = Pick<Module, 'courseId' | 'title' | 'order'>;
export type UpdateModuleData = Partial<Pick<Module, 'title' | 'order'>>;

export interface ReorderModulesData {
  moduleIds: string[];
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  content?: string;
  videoUrl?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type CreateLessonData = Pick<Lesson, 'moduleId' | 'title' | 'content' | 'videoUrl' | 'order'>;
export type UpdateLessonData = Partial<Pick<Lesson, 'title' | 'content' | 'videoUrl' | 'order'>>;

export interface ReorderLessonsData {
  lessonIds: string[];
}

// ── Assignments ───────────────────────────────────────────────────────────────

export type AttachmentType = 'link' | 'pdf';

export interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  url: string;
  size?: number;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate?: string;
  maxPoints?: number;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentData {
  courseId: string;
  title: string;
  description?: string;
  dueDate?: string;
  maxPoints?: number;
  attachments?: Attachment[];
  moduleId?: string;
}

export type UpdateAssignmentData = Partial<CreateAssignmentData>;

// ── Submissions ───────────────────────────────────────────────────────────────

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  content?: string;
  fileUrl?: string;
  grade?: number;
  feedback?: string;
  submittedAt: string;
}

export type CreateSubmissionData = Pick<Submission, 'assignmentId' | 'content' | 'fileUrl'>;

export interface GradeSubmissionData {
  grade: number;
  feedback?: string;
}

export interface BulkGradeSubmissionsData {
  grades: Array<{ submissionId: string } & GradeSubmissionData>;
}

// ── Quizzes ───────────────────────────────────────────────────────────────────

export type QuizStatus = 'DRAFT' | 'PUBLISHED';

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  status: QuizStatus;
  isPublished: boolean;
  duration?: number | null;
  maxAttempts: number;
  passingScore: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateQuizData = Pick<Quiz, 'courseId' | 'title'> & {
  description?: string;
  duration?: number;
  maxAttempts?: number;
  passingScore?: number;
  dueDate?: string;
  moduleId?: string;
};

export type UpdateQuizData = Partial<{
  courseId: string;
  title: string;
  description?: string;
  duration?: number;
  maxAttempts?: number;
  passingScore?: number;
  dueDate?: string;
  isPublished?: boolean;
}>;

// ── Quiz Questions ────────────────────────────────────────────────────────────

export interface QuizQuestionOption {
  text: string;
  imageUrl?: string | null;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  text: string;
  imageUrl?: string | null;
  options: QuizQuestionOption[];
  correctOption: number;
  explanation?: string | null;
  points?: number;
  order?: number;
}

export interface CreateQuestionData {
  text: string;
  imageUrl?: string | null;
  options: QuizQuestionOption[];
  correctOption: number;
  explanation?: string | null;
  points?: number;
}

export type UpdateQuestionData = Partial<CreateQuestionData>;

export interface BulkAddQuestionsData {
  questions: CreateQuestionData[];
}

export interface QuizAttemptAnswers {
  [questionId: string]: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  answers: QuizAttemptAnswers;
  score?: number;
  submittedAt: string;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface Attendance {
  id: string;
  courseId: string;
  userId: string;
  date: string;
  status: AttendanceStatus;
}

export type MarkAttendanceData = Pick<Attendance, 'courseId' | 'userId' | 'date' | 'status'>;
export type UpdateAttendanceData = Partial<Pick<Attendance, 'status'>>;

export interface BulkAttendanceData {
  courseId: string;
  date: string;
  records: Array<Pick<Attendance, 'userId' | 'status'>>;
}

// ── Grades ────────────────────────────────────────────────────────────────────

export interface Grade {
  id: string;
  courseId: string;
  studentId: string;
  assignmentId?: string;
  value: number;
  notes?: string;
  createdAt: string;
}

export type CreateGradeData = Pick<Grade, 'courseId' | 'studentId' | 'assignmentId' | 'value' | 'notes'>;
export type UpdateGradeData = Partial<Pick<Grade, 'value' | 'notes'>>;

// ── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
}

export type SendMessageData = Pick<Message, 'recipientId' | 'content'>;

// ── Discussions ───────────────────────────────────────────────────────────────

export interface Discussion {
  id: string;
  courseId: string;
  authorId: string;
  title: string;
  content: string;
  replies: DiscussionReply[];
  createdAt: string;
}

export interface DiscussionReply {
  id: string;
  discussionId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export type CreateDiscussionData = Pick<Discussion, 'courseId' | 'title' | 'content'>;

// ── Announcements ─────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  courseId: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: string;
}

export type CreateAnnouncementData = Pick<Announcement, 'courseId' | 'title' | 'content'>;
export type UpdateAnnouncementData = Partial<Pick<Announcement, 'title' | 'content'>>;

// ── Settings ──────────────────────────────────────────────────────────────────

export interface UpdateProfileData {
  name?: string;
  bio?: string;
  phone?: string;
}

export interface UpdateNotificationsData {
  notifEmail?: boolean;
  notifPush?: boolean;
  notifAssignment?: boolean;
  notifGrade?: boolean;
  notifNewCourse?: boolean;
}

export interface UpdatePrivacyData {
  privacyProfile?: boolean;
  privacyActivity?: boolean;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

// ── Core request helper ───────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  const json = await res.json() as T & { message?: string };

  if (!res.ok) {
    throw new Error(json.message || `Request failed: ${res.status}`);
  }

  return { data: json, status: res.status };
}

async function requestFormData<T = unknown>(
  endpoint: string,
  method: string,
  body: FormData,
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, { method, headers, body });
  const json = await res.json() as T & { message?: string };
  if (!res.ok) throw new Error(json.message || `Request failed: ${res.status}`);
  return { data: json, status: res.status };
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  register: (name: string, email: string, password: string, role: UserRole) =>
    request<AuthTokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    }),

  login: (email: string, password: string) =>
    request<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () =>
    request<User>('/auth/me'),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: () =>
    request<{ success: boolean; data: { user: User } }>('/settings'),

  updateSettingsProfile: (data: UpdateProfileData) =>
    request<{ success: boolean; data: { user: User } }>('/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadAvatar: (formData: FormData) =>
    requestFormData<{ success: boolean; data: { user: User; avatarUrl: string } }>('/settings/avatar', 'POST', formData),

  updateNotifications: (data: UpdateNotificationsData) =>
    request<{ success: boolean; data: { user: User } }>('/settings/notifications', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updatePrivacy: (data: UpdatePrivacyData) =>
    request<{ success: boolean; data: { user: User } }>('/settings/privacy', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteAvatar: () =>
    request<{ user: User }>('/settings/avatar', { method: 'DELETE' }),

  changePassword: (data: ChangePasswordData) =>
    request<void>('/settings/password', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers: (query = '') =>
    request<User[]>(`/users${query}`),

  getUserById: (id: string) =>
    request<User>(`/users/${id}`),

  updateUser: (id: string, data: Partial<User>) =>
    request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteUser: (id: string) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),

  deleteMe: () =>
    request<void>('/users/me', { method: 'DELETE' }),

  // ── Courses ───────────────────────────────────────────────────────────────
  getCourses: (query = '') =>
    request<Course[]>(`/courses${query}`),

  getCourseById: (id: string) =>
    request<Course>(`/courses/${id}`),

  createCourse: (data: CreateCourseData) =>
    request<Course>('/courses', { method: 'POST', body: JSON.stringify(data) }),

  updateCourse: (id: string, data: UpdateCourseData) =>
    request<Course>(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteCourse: (id: string) =>
    request<void>(`/courses/${id}`, { method: 'DELETE' }),

  // Enroll now submits an EnrollmentRequest, not a direct enrollment
  enrollCourse: (id: string) =>
    request<{ enrollmentRequest: { id: string; status: string } }>(`/courses/${id}/enroll`, { method: 'POST' }),

  unenrollCourse: (id: string) =>
    request<void>(`/courses/${id}/enroll`, { method: 'DELETE' }),

  getCourseStudents: (id: string) =>
    request<User[]>(`/courses/${id}/students`),

  getEnrolledCourses: () =>
    request<unknown>('/courses?enrolled=true&limit=100'),

  getMyCourses: () =>
    request<unknown>('/courses/my-courses'),

  getMyEnrollmentRequests: () =>
    request<{ success: boolean; data: { requests: EnrollmentRequest[] } }>('/courses/my-enrollment-requests'),

  // ── Admin: Enrollment Requests ────────────────────────────────────────────
  admin: {
    getDashboard: () =>
      request<unknown>('/admin/dashboard'),

    getStudents: (query = '') =>
      request<User[]>(`/admin/students${query}`),

    getEnrollmentRequests: (query = '') =>
      request<unknown>(`/admin/enrollment-requests${query}`),

    getEnrollmentRequestStats: () =>
      request<{ data: { stats: EnrollmentRequestStats } }>('/admin/enrollment-requests/stats'),

    approveEnrollmentRequest: (id: string, adminNote?: string) =>
      request<unknown>(`/admin/enrollment-requests/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ adminNote }),
      }),

    rejectEnrollmentRequest: (id: string, adminNote?: string) =>
      request<unknown>(`/admin/enrollment-requests/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ adminNote }),
      }),

    deleteEnrollmentRequest: (id: string) =>
      request<void>(`/admin/enrollment-requests/${id}`, { method: 'DELETE' }),
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getStudentDashboard: () =>
    request<unknown>('/dashboard/student'),

  getTeacherDashboard: () =>
    request<unknown>('/dashboard/teacher'),

  getAdminDashboard: () =>
    request<unknown>('/admin/dashboard'),

  // ── Modules ───────────────────────────────────────────────────────────────
  getModules: (courseId: string) =>
    request<Module[]>(`/modules?courseId=${courseId}`),

  getModuleById: (id: string) =>
    request<Module>(`/modules/${id}`),

  createModule: (data: CreateModuleData) =>
    request<Module>('/modules', { method: 'POST', body: JSON.stringify(data) }),

  updateModule: (id: string, data: UpdateModuleData) =>
    request<Module>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteModule: (id: string) =>
    request<void>(`/modules/${id}`, { method: 'DELETE' }),

  // ── Lessons ───────────────────────────────────────────────────────────────
  getLessons: (moduleId: string) =>
    request<Lesson[]>(`/lessons?moduleId=${moduleId}`),

  getLessonById: (id: string) =>
    request<Lesson>(`/lessons/${id}`),

  createLesson: (data: CreateLessonData) =>
    request<Lesson>('/lessons', { method: 'POST', body: JSON.stringify(data) }),

  updateLesson: (id: string, data: UpdateLessonData) =>
    request<Lesson>(`/lessons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteLesson: (id: string) =>
    request<void>(`/lessons/${id}`, { method: 'DELETE' }),

  // ── Assignments ───────────────────────────────────────────────────────────
  getAssignments: (query = '') =>
    request<Assignment[]>(`/assignments${query}`),

  getAssignmentById: (id: string) =>
    request<Assignment>(`/assignments/${id}`),

  createAssignment: (data: CreateAssignmentData) =>
    request<Assignment>('/teacher/assignments', {
      method: 'POST',
      body: JSON.stringify({ ...data, attachments: data.attachments || [] }),
    }),

  updateAssignment: (id: string, data: UpdateAssignmentData) =>
    request<Assignment>(`/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteAssignment: (id: string) =>
    request<void>(`/assignments/${id}`, { method: 'DELETE' }),

  // ── Submissions ───────────────────────────────────────────────────────────
  getSubmissions: (query = '') =>
    request<Submission[]>(`/submissions${query}`),

  getSubmissionById: (id: string) =>
    request<Submission>(`/submissions/${id}`),

  createSubmission: (data: CreateSubmissionData) =>
    request<Submission>('/submissions', { method: 'POST', body: JSON.stringify(data) }),

  gradeSubmission: (id: string, data: GradeSubmissionData) =>
    request<Submission>(`/submissions/${id}/grade`, { method: 'PATCH', body: JSON.stringify(data) }),

  bulkGradeSubmissions: (data: BulkGradeSubmissionsData) =>
    request<void>('/submissions/bulk-grade', { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Student Quizzes ───────────────────────────────────────────────────────
  getQuizzes: (query = '') =>
    request(`/quizzes${query}`),

  getStudentQuestions: (quizId: string) =>
    request(`/quizzes/${quizId}/questions`),

  submitQuiz: (quizId: string, answers: Array<{ questionId: string; selectedOption: number }>) =>
    request(`/quizzes/${quizId}/attempt`, { method: 'POST', body: JSON.stringify({ answers }) }),

  // ── Attendance ────────────────────────────────────────────────────────────
  getAttendance: (query = '') =>
    request<Attendance[]>(`/attendance${query}`),

  getAttendanceSummary: (query = '') =>
    request<unknown>(`/attendance/summary${query}`),

  markAttendance: (data: MarkAttendanceData) =>
    request<Attendance>('/attendance', { method: 'POST', body: JSON.stringify(data) }),

  markBulkAttendance: (data: BulkAttendanceData) =>
    request<Attendance[]>('/attendance/bulk', { method: 'POST', body: JSON.stringify(data) }),

  updateAttendance: (id: string, data: UpdateAttendanceData) =>
    request<Attendance>(`/attendance/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Grades ────────────────────────────────────────────────────────────────
  getGrades: (query = '') =>
    request<Grade[]>(`/grades${query}`),

  getGradebook: (courseId: string) =>
    request<unknown>(`/grades/gradebook?courseId=${courseId}`),

  createGrade: (data: CreateGradeData) =>
    request<Grade>('/grades', { method: 'POST', body: JSON.stringify(data) }),

  updateGrade: (id: string, data: UpdateGradeData) =>
    request<Grade>(`/grades/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteGrade: (id: string) =>
    request<void>(`/grades/${id}`, { method: 'DELETE' }),

  // ── Progress ──────────────────────────────────────────────────────────────
  getProgress: (query = '') =>
    request<unknown>(`/progress${query}`),

  getAllCoursesSummary: () =>
    request<unknown>('/progress/summary'),

  getCourseSummary: (courseId: string) =>
    request<unknown>(`/progress/course/${courseId}`),

  markLessonComplete: (lessonId: string) =>
    request<void>(`/progress/lesson/${lessonId}/complete`, { method: 'POST' }),

  unmarkLessonComplete: (lessonId: string) =>
    request<void>(`/progress/lesson/${lessonId}/complete`, { method: 'DELETE' }),

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: (query = '') =>
    request<Notification[]>(`/notifications${query}`),

  markNotificationRead: (id: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsRead: () =>
    request<void>('/notifications/read-all', { method: 'PATCH' }),

  deleteNotification: (id: string) =>
    request<void>(`/notifications/${id}`, { method: 'DELETE' }),

  // ── Messages ──────────────────────────────────────────────────────────────
  getMessages: (query = '') =>
    request<Message[]>(`/messages${query}`),

  getMessageById: (id: string) =>
    request<Message>(`/messages/${id}`),

  sendMessage: (data: SendMessageData) =>
    request<Message>('/messages', { method: 'POST', body: JSON.stringify(data) }),

  deleteMessage: (id: string) =>
    request<void>(`/messages/${id}`, { method: 'DELETE' }),

  // ── Discussions ───────────────────────────────────────────────────────────
  getDiscussions: (query = '') =>
    request<unknown>(`/discussions/all${query}`),

  getDiscussionById: (id: string) =>
    request<Discussion>(`/discussions/${id}`),

  createDiscussion: (data: CreateDiscussionData) =>
    request<Discussion>('/discussions', { method: 'POST', body: JSON.stringify(data) }),

  addReply: (id: string, content: string) =>
    request<DiscussionReply>(`/discussions/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  updateDiscussion: (id: string, data: { title?: string; content?: string; tag?: string; courseId?: string }) =>
    request<unknown>(`/discussions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: data.title, content: data.content, category: data.tag?.toUpperCase() }),
    }),

  deleteDiscussion: (id: string) =>
    request<void>(`/discussions/${id}`, { method: 'DELETE' }),

  replyToThread: (id: string, data: { content: string }) =>
    request<unknown>(`/discussions/${id}/replies`, { method: 'POST', body: JSON.stringify(data) }),

  createThread: (data: { title: string; content: string; tag: string; courseId: string }) =>
    request<unknown>('/discussions', {
      method: 'POST',
      body: JSON.stringify({ courseId: data.courseId, title: data.title, content: data.content, category: data.tag.toUpperCase() }),
    }),

  updateThread: (id: string, data: { title: string; content: string; tag: string; courseId: string }) =>
    request<unknown>(`/discussions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: data.title, content: data.content, category: data.tag.toUpperCase() }),
    }),

  deleteThread: (id: string) =>
    request<void>(`/discussions/${id}`, { method: 'DELETE' }),

  likeReply: (_threadId: string, _replyId: string) =>
    Promise.resolve({ data: null, status: 200 }),

  lockThread: (id: string) =>
  request<{ success: boolean; message: string; data: { isLocked: boolean; status: string } }>(
    `/discussions/${id}/lock`,
    { method: 'PATCH' },
  ),
 
  publishThread: (id: string) =>
    request<{ success: boolean; message: string; data: { isVisible: boolean } }>(
      `/discussions/${id}/publish`,
      { method: 'PATCH' },
    ),

  // ── Announcements ─────────────────────────────────────────────────────────
  getAnnouncements: (query = '') =>
    request<Announcement[]>(`/announcements${query}`),

  createAnnouncement: (data: CreateAnnouncementData) =>
    request<Announcement>('/announcements', { method: 'POST', body: JSON.stringify(data) }),

  updateAnnouncement: (id: string, data: UpdateAnnouncementData) =>
    request<Announcement>(`/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteAnnouncement: (id: string) =>
    request<void>(`/announcements/${id}`, { method: 'DELETE' }),

  // ── Video upload ──────────────────────────────────────────────────────────
  uploadVideo: (file: File): Promise<ApiResponse<{ url: string; publicId: string; duration: number }>> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('video', file);
    return fetch(`${BASE_URL}/upload/video`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async res => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Upload failed: ${res.status}`);
      return { data: json, status: res.status };
    });
  },

  // ── Teacher ───────────────────────────────────────────────────────────────
  teacher: {
    getDashboard: () => request<unknown>('/teacher/dashboard'),

    getCourses: (query = '') => request<Course[]>(`/teacher/courses${query}`),
    getCourseById: (id: string) => request<Course>(`/teacher/courses/${id}`),

    createCourse: (data: CreateCourseData) =>
      request<Course>('/teacher/courses', { method: 'POST', body: JSON.stringify(data) }),

    updateCourse: (id: string, data: UpdateCourseData) =>
      request<Course>(`/teacher/courses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteCourse: (id: string) =>
      request<void>(`/teacher/courses/${id}`, { method: 'DELETE' }),

    toggleCoursePublish: (id: string) =>
      request<Course>(`/teacher/courses/${id}/publish`, { method: 'PATCH' }),

    getCourseStudents: (courseId: string) =>
      request<User[]>(`/teacher/courses/${courseId}/students`),

    removeStudentFromCourse: (courseId: string, userId: string) =>
      request<void>(`/teacher/courses/${courseId}/students/${userId}`, { method: 'DELETE' }),

    getCourseModules: (courseId: string) =>
      request<Module[]>(`/teacher/courses/${courseId}/modules`),

    createModule: (courseId: string, data: Omit<CreateModuleData, 'courseId'>) =>
      request<Module>(`/teacher/courses/${courseId}/modules`, { method: 'POST', body: JSON.stringify(data) }),

    reorderModules: (courseId: string, data: ReorderModulesData) =>
      request<void>(`/teacher/courses/${courseId}/modules/reorder`, { method: 'PATCH', body: JSON.stringify(data) }),

    updateModule: (moduleId: string, data: UpdateModuleData) =>
      request<Module>(`/teacher/modules/${moduleId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteModule: (moduleId: string) =>
      request<void>(`/teacher/modules/${moduleId}`, { method: 'DELETE' }),

    getModuleLessons: (moduleId: string) =>
      request<Lesson[]>(`/teacher/modules/${moduleId}/lessons`),

    createLesson: (moduleId: string, data: Omit<CreateLessonData, 'moduleId'>) =>
      request<Lesson>(`/teacher/modules/${moduleId}/lessons`, { method: 'POST', body: JSON.stringify(data) }),

    reorderLessons: (moduleId: string, data: ReorderLessonsData) =>
      request<void>(`/teacher/modules/${moduleId}/lessons/reorder`, { method: 'PATCH', body: JSON.stringify(data) }),

    updateLesson: (lessonId: string, data: UpdateLessonData) =>
      request<Lesson>(`/teacher/lessons/${lessonId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteLesson: (lessonId: string) =>
      request<void>(`/teacher/lessons/${lessonId}`, { method: 'DELETE' }),

    getAssignments: (query = '') => request<Assignment[]>(`/teacher/assignments${query}`),
    getAssignmentById: (id: string) => request<Assignment>(`/teacher/assignments/${id}`),

    createAssignment: (data: CreateAssignmentData) =>
      request<Assignment>('/teacher/assignments', { method: 'POST', body: JSON.stringify(data) }),

    updateAssignment: (id: string, data: UpdateAssignmentData) =>
      request<Assignment>(`/teacher/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    uploadFile: (formData: FormData) =>
      requestFormData<{ url: string }>('/upload/file', 'POST', formData),

    deleteAssignment: (id: string) =>
      request<void>(`/teacher/assignments/${id}`, { method: 'DELETE' }),

    getSubmissions: (query = '') => request<Submission[]>(`/teacher/submissions${query}`),
    getSubmissionById: (id: string) => request<Submission>(`/teacher/submissions/${id}`),

    gradeSubmission: (id: string, data: GradeSubmissionData) =>
      request<Submission>(`/teacher/submissions/${id}/grade`, { method: 'PATCH', body: JSON.stringify(data) }),

    bulkGradeSubmissions: (data: BulkGradeSubmissionsData) =>
      request<void>('/teacher/submissions/bulk-grade', { method: 'PATCH', body: JSON.stringify(data) }),

    getQuizzes: (query = '') => request<Quiz[]>(`/teacher/quizzes${query}`),
    getQuizById: (id: string) => request<Quiz>(`/teacher/quizzes/${id}`),

    createQuiz: (data: CreateQuizData) =>
      request<Quiz>('/teacher/quizzes', { method: 'POST', body: JSON.stringify(data) }),

    updateQuiz: (id: string, data: UpdateQuizData) =>
      request<Quiz>(`/teacher/quizzes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteQuiz: (id: string) =>
      request<void>(`/teacher/quizzes/${id}`, { method: 'DELETE' }),

    toggleQuizPublish: (id: string) =>
      request<Quiz>(`/teacher/quizzes/${id}/publish`, { method: 'PATCH' }),

    getQuizQuestions: (quizId: string) =>
      request<QuizQuestion[]>(`/teacher/quizzes/${quizId}/questions`),

    addQuestion: (quizId: string, data: CreateQuestionData) =>
      request<QuizQuestion>(`/teacher/quizzes/${quizId}/questions`, { method: 'POST', body: JSON.stringify(data) }),

    bulkAddQuestions: (quizId: string, data: BulkAddQuestionsData) =>
      request<QuizQuestion[]>(`/teacher/quizzes/${quizId}/questions/bulk`, { method: 'POST', body: JSON.stringify(data) }),

    replaceQuizQuestions: (quizId: string, data: BulkAddQuestionsData) =>
      request<QuizQuestion[]>(`/teacher/quizzes/${quizId}/questions/replace`, { method: 'PUT', body: JSON.stringify(data) }),

    reorderQuestions: (quizId: string, questions: Array<{ id: string; order: number }>) =>
      request<void>(`/teacher/quizzes/${quizId}/questions/reorder`, { method: 'PATCH', body: JSON.stringify({ questions }) }),

    getQuizAttempts: (quizId: string) =>
      request<QuizAttempt[]>(`/teacher/quizzes/${quizId}/attempts`),

    updateQuestion: (questionId: string, data: UpdateQuestionData) =>
      request<QuizQuestion>(`/teacher/questions/${questionId}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteQuestion: (questionId: string) =>
      request<void>(`/teacher/questions/${questionId}`, { method: 'DELETE' }),

    getAttendance: (query = '') => request<Attendance[]>(`/teacher/attendance${query}`),

    getAttendanceSummary: (query = '') =>
      request<unknown>(`/teacher/attendance/summary${query}`),

    markAttendance: (data: MarkAttendanceData) =>
      request<Attendance>('/teacher/attendance', { method: 'POST', body: JSON.stringify(data) }),

    markBulkAttendance: (data: BulkAttendanceData) =>
      request<Attendance[]>('/teacher/attendance/bulk', { method: 'POST', body: JSON.stringify(data) }),

    getAnnouncements: (query = '') => request<Announcement[]>(`/teacher/announcements${query}`),

    createAnnouncement: (data: CreateAnnouncementData) =>
      request<Announcement>('/teacher/announcements', { method: 'POST', body: JSON.stringify(data) }),

    updateAnnouncement: (id: string, data: UpdateAnnouncementData) =>
      request<Announcement>(`/teacher/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteAnnouncement: (id: string) =>
      request<void>(`/teacher/announcements/${id}`, { method: 'DELETE' }),

    getGrades: (query = '') => request<Grade[]>(`/teacher/grades${query}`),

    getGradebook: (courseId: string) =>
      request<unknown>(`/teacher/grades/gradebook?courseId=${courseId}`),

    createGrade: (data: CreateGradeData) =>
      request<Grade>('/teacher/grades', { method: 'POST', body: JSON.stringify(data) }),

    updateGrade: (id: string, data: UpdateGradeData) =>
      request<Grade>(`/teacher/grades/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    deleteGrade: (id: string) =>
      request<void>(`/teacher/grades/${id}`, { method: 'DELETE' }),

    getAllStudents: (query = '') => request<User[]>(`/teacher/students${query}`),

    getStudentProgress: (userId: string) =>
      request<unknown>(`/teacher/students/${userId}/progress`),
  },
};