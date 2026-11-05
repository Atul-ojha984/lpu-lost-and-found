import Link from 'next/link';
import { LPULogo } from '@/components/branding/LPULogo';

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center mb-6 text-center">
        <Link href="/" className="inline-block focus:outline-none mb-3">
          <LPULogo size="md" showSubtitle={false} />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-wider text-[#283442] uppercase">LOST &amp; FOUND</span>
          <span className="text-xs font-bold tracking-widest text-[#F58220] uppercase">MANAGEMENT SYSTEM</span>
        </div>
      </div>

      <section className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white p-7 shadow-[0_10px_30px_rgba(25,43,74,0.06)] sm:p-9">
        <h1 className="text-xl font-bold tracking-tight text-[#283442] sm:text-2xl">Accounts are created by campus administrators</h1>
        <p className="mt-2 text-xs text-slate-500">
          Public self-registration is disabled. Contact an authorized campus administrator to request a student, staff, or security account.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl py-3 px-4 text-sm font-bold text-white lpu-btn-primary"
        >
          Return to Sign In
        </Link>
      </section>
    </main>
  );
}
