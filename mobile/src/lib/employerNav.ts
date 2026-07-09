// Where an employer lands based on account status (mirrors web's DEST_FOR +
// EmployerDashboard's PENDING redirect).
export function employerDest(status: string | undefined): string {
  switch (status) {
    case 'APPROVED': return '/employer/dashboard';
    case 'PENDING': return '/employer/pending-approval';
    case 'REJECTED':
    case 'SUSPENDED': return '/employer/status';
    default: return '/employer/pending-approval';
  }
}
