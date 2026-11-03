erDiagram
GYMS ||--o{ USERS : possui
GYMS ||--o{ CLASSES : possui
GYMS ||--o{ ANNOUNCEMENTS : publica
GYMS ||--o{ PRODUCTS : vende
GYMS ||--o{ PAYMENTS : recebe

USERS ||--o| STUDENT_PROFILE : possui
USERS ||--o{ ATTENDANCES : registra
USERS ||--o{ GRADUATIONS : recebe
USERS ||--o{ PAYMENTS : deve
USERS ||--o{ ORDERS : realiza
USERS ||--o{ DEVICE_TOKENS : possui
USERS ||--o{ CLASSES : ministra
USERS ||--o{ CLASS_SESSIONS : conduz
USERS ||--o{ ANNOUNCEMENTS : publica

BELTS ||--o{ STUDENT_PROFILE : classifica
BELTS ||--o{ GRADUATIONS : registra
PLANS ||--o{ PAYMENTS : gera

CLASSES ||--o{ CLASS_SESSIONS : agenda
CLASS_SESSIONS ||--o{ ATTENDANCES : valida

ORDERS ||--o{ ORDER_ITEMS : contem
PRODUCTS ||--o{ ORDER_ITEMS : participa

GYMS {
string gymId PK
string name
string address
string logoUrl
string timezone
boolean active
}

USERS {
string uid PK
string name
string email
string phone
string photoUrl
string role
string gymId FK
string status
timestamp createdAt
}

STUDENT_PROFILE {
string userId PK
string beltId FK
string beltName
int stripes
timestamp startDate
int totalClasses
int totalMatMinutes
timestamp lastCheckInAt
string financialStatus
string planId FK
}

BELTS {
string beltId PK
string name
int order
string colorHex
int minMonths
int minClasses
int minMatMinutes
boolean active
}

CLASSES {
string classId PK
string gymId FK
string name
string modality
string level
string teacherId FK
string startTime
string endTime
boolean active
}

CLASS_SESSIONS {
string sessionId PK
string classId FK
string gymId FK
string teacherId FK
timestamp date
timestamp startTime
timestamp endTime
string status
}

ATTENDANCES {
string attendanceId PK
string sessionId FK
string userId FK
string classId FK
string gymId FK
timestamp sessionDate
timestamp checkInAt
string status
string confirmedBy FK
timestamp confirmedAt
int minutes
string source
}

GRADUATIONS {
string graduationId PK
string userId FK
string gymId FK
string beltId FK
string type
int stripes
string awardedBy FK
timestamp awardedAt
string reason
}

PLANS {
string planId PK
string gymId FK
string name
int amount
string currency
int billingCycleDays
boolean active
}

PAYMENTS {
string paymentId PK
string gymId FK
string userId FK
string planId FK
string referenceMonth
timestamp dueDate
timestamp paidAt
int amount
string status
string method
}

ANNOUNCEMENTS {
string announcementId PK
string gymId FK
string title
string message
string authorId FK
string audience
timestamp publishedAt
boolean active
}

PRODUCTS {
string productId PK
string gymId FK
string name
string category
int price
int stock
boolean active
}

ORDERS {
string orderId PK
string gymId FK
string userId FK
string status
int total
timestamp createdAt
timestamp paidAt
}

ORDER_ITEMS {
string itemId PK
string orderId FK
string productId FK
string name
int price
int quantity
int subtotal
}

DEVICE_TOKENS {
string tokenId PK
string userId FK
string token
string platform
boolean active
}
