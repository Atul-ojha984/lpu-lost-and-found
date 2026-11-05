import { redirect } from 'next/navigation';

export default function SecurityHandoversPage() {
  // Keep the existing navigation URL pointed at the real supervised Django
  // handover flow instead of the retired demo OTP screen.
  redirect('/security/custody?tab=handover');
}
