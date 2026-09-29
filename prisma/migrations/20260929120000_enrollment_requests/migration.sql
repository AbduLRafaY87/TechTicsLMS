CREATE TYPE "EnrollmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "EnrollmentRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "EnrollmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "EnrollmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrollmentRequest_userId_courseId_key" ON "EnrollmentRequest"("userId", "courseId");
CREATE INDEX "EnrollmentRequest_status_requestedAt_idx" ON "EnrollmentRequest"("status", "requestedAt");

ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentRequest" ADD CONSTRAINT "EnrollmentRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;