'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  LockKeyhole,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { apiClient, ApiClientError, type CustodyLocationRecord, type DirectRecoveryRecord, type DirectRecoveryReport } from '@/lib/api-client';
import { formatDisplayDateTime } from '@/lib/formatters';

interface DirectRecoveryPanelProps {
  onPrintSlip: (directRecoveryId: string) => void;
  isPrintingSlip: boolean;
  printError: string | null;
  custodyLocations: CustodyLocationRecord[];
}

export function DirectRecoveryPanel({ onPrintSlip, isPrintingSlip, printError, custodyLocations }: DirectRecoveryPanelProps) {
  const [search, setSearch] = useState('');
  const [eligibleReports, setEligibleReports] = useState<DirectRecoveryReport[]>([]);
  const [activeRecoveries, setActiveRecoveries] = useState<DirectRecoveryRecord[]>([]);
  const [completedRecoveries, setCompletedRecoveries] = useState<DirectRecoveryRecord[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedRecoveryId, setSelectedRecoveryId] = useState('');
  const [intakeLocationId, setIntakeLocationId] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [physicalItemReceived, setPhysicalItemReceived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [vaultDetails, setVaultDetails] = useState<string | null>(null);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [privateDetailsMatched, setPrivateDetailsMatched] = useState(false);
  const [reportPhotoMatched, setReportPhotoMatched] = useState(false);
  const [studentIdVerified, setStudentIdVerified] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [verificationAnswers, setVerificationAnswers] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState('');

  const [otp, setOtp] = useState('');
  const [handoverLocationId, setHandoverLocationId] = useState('');
  const [idCardType, setIdCardType] = useState('LPU_STUDENT_ID');
  const [idCardNumber, setIdCardNumber] = useState('');
  const [idCardInspected, setIdCardInspected] = useState(false);
  const [acknowledgementNotes, setAcknowledgementNotes] = useState('');
  const [completedRecoveryId, setCompletedRecoveryId] = useState<string | null>(null);
  const activeCustodyLocations = custodyLocations.filter((location) => location.isActive);
  const intakeLocation = activeCustodyLocations.find((location) => location.id === intakeLocationId) || activeCustodyLocations[0];
  const selectedIntakeLocationId = intakeLocation?.id || '';
  const handoverLocation = activeCustodyLocations.find((location) => location.id === handoverLocationId) || activeCustodyLocations[0];
  const selectedHandoverLocationId = handoverLocation?.id || '';

  const loadRecords = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    const requests = await Promise.allSettled([
      apiClient.getEligibleDirectLostReports(search),
      apiClient.getDirectRecoveries(search),
      apiClient.getDirectRecoveryHistory(),
    ]);
    const labels = ['Eligible lost reports', 'Direct recovery queue', 'Completed recovery history'];
    const errors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === 'rejected') {
        const message = result.reason instanceof ApiClientError
          ? result.reason.message
          : 'Unable to load this list. Please retry.';
        errors.push(`${labels[index]}: ${message}`);
        return;
      }

      if (index === 0) setEligibleReports(result.value as DirectRecoveryReport[]);
      if (index === 1) setActiveRecoveries(result.value as DirectRecoveryRecord[]);
      if (index === 2) setCompletedRecoveries(result.value as DirectRecoveryRecord[]);
    });
    setError(errors.length ? errors.join(' · ') : null);
    if (showLoading) setIsLoading(false);
  }, [search]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadRecords(true), 0);
    const timer = window.setInterval(() => void loadRecords(), 20000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadRecords]);

  const resetRecoveryForm = () => {
    setVaultDetails(null);
    setPrivateDetailsMatched(false);
    setReportPhotoMatched(false);
    setStudentIdVerified(false);
    setVerificationNotes('');
    setVerificationAnswers({});
    setRejectionReason('');
    setOtp('');
    setIdCardNumber('');
    setIdCardInspected(false);
    setAcknowledgementNotes('');
  };

  const selectRecovery = (recoveryId: string) => {
    resetRecoveryForm();
    setSelectedRecoveryId(recoveryId);
  };

  const selectedReport = eligibleReports.find((report) => report.id === selectedReportId);
  const selectedRecovery = activeRecoveries.find((record) => record.directRecoveryId === selectedRecoveryId);

  const handleIntake = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedReportId || !physicalItemReceived || !selectedIntakeLocationId) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const record = await apiClient.createDirectRecoveryIntake({
        reportId: selectedReportId,
        physicalDeskLocation: intakeLocation?.name || '',
        custodyLocationId: selectedIntakeLocationId,
        physicalItemReceived,
        intakeNotes: intakeNotes.trim(),
      });
      setNotice(`Physical intake recorded for ${record.item.referenceNumber}. Independent ownership review is required.`);
      setSelectedReportId('');
      setIntakeNotes('');
      setPhysicalItemReceived(false);
      selectRecovery(record.directRecoveryId);
      await loadRecords();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to record the physical intake.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrivateVaultView = async () => {
    if (!selectedRecovery) return;
    setIsLoadingVault(true);
    setError(null);
    try {
      const vault = await apiClient.viewPrivateVault(selectedRecovery.itemId);
      setVaultDetails(vault.decryptedContent);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to inspect this report private ownership details.');
    } finally {
      setIsLoadingVault(false);
    }
  };

  const handleReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedRecovery) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.reviewDirectRecovery(selectedRecovery.directRecoveryId, action === 'APPROVE' ? {
        action,
        studentIdVerified,
        privateDetailsMatched,
        reportPhotoMatched,
        verificationNotes: verificationNotes.trim(),
        verificationAnswers: Object.entries(verificationAnswers)
          .filter(([, answer]) => answer.trim())
          .map(([challengeId, answer]) => ({ challengeId, answer: answer.trim() })),
      } : {
        action,
        rejectionReason: rejectionReason.trim(),
      });
      setNotice(action === 'APPROVE'
        ? 'Direct recovery approved. The claimant can now retrieve the collection OTP from My Reports.'
        : 'Direct recovery was rejected and the reason was recorded.');
      setSelectedRecoveryId('');
      await loadRecords();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to review this direct recovery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteHandover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRecovery || !otp.trim() || !idCardNumber.trim() || !idCardInspected || !selectedHandoverLocationId) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.completeDirectRecovery(selectedRecovery.directRecoveryId, {
        otp: otp.trim(),
        physicalDeskLocation: handoverLocation?.name || '',
        custodyLocationId: selectedHandoverLocationId,
        idCardPresentedType: idCardType,
        idCardNumber: idCardNumber.trim(),
        idCardInspected,
        acknowledgementNotes: acknowledgementNotes.trim() || undefined,
      });
      setNotice('Direct recovery completed. The report is now in the claimant recovery history.');
      setCompletedRecoveryId(selectedRecovery.directRecoveryId);
      setSelectedRecoveryId('');
      await loadRecords();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to verify the OTP and complete handover.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Direct Handover from an Existing Lost Report</h2>
            <p className="mt-1 text-xs text-slate-500">
              Link the physical intake to the original report. An independent officer must verify ownership before OTP approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRecords(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {printError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{printError}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <form onSubmit={handleIntake} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <PackageCheck className="h-4 w-4 text-emerald-700" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">Record Physical Intake</h3>
              <p className="text-[11px] text-slate-500">Uses the reporter&apos;s existing LOST report; no found report or claim is created.</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void loadRecords(true);
                  }
                }}
                placeholder="Search report, student, or item..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <button type="button" onClick={() => void loadRecords(true)} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Search</button>
          </div>

          <label className="block space-y-1.5 text-xs font-medium text-slate-700">
            Existing Lost Item Report <span className="text-red-600">*</span>
            <select
              value={selectedReportId}
              onChange={(event) => setSelectedReportId(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="">Select an eligible report</option>
              {eligibleReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.referenceNumber} - {report.title} - {report.reporter.fullName} ({report.reporter.registrationNumber})
                </option>
              ))}
            </select>
          </label>

          {selectedReport && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">{selectedReport.title} <span className="font-mono text-slate-500">{selectedReport.referenceNumber}</span></p>
              <p className="mt-1">Owner: {selectedReport.reporter.fullName} ({selectedReport.reporter.registrationNumber})</p>
              <p className="mt-1 text-slate-500">{selectedReport.publicDescription}</p>
            </div>
          )}

          <label className="block space-y-1.5 text-xs font-medium text-slate-700">
            Security desk or office <span className="text-red-600">*</span>
            <select value={selectedIntakeLocationId} onChange={(event) => setIntakeLocationId(event.target.value)} required className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none">
              <option value="">Select an active custody location</option>
              {activeCustodyLocations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-slate-700">
            Intake notes
            <textarea value={intakeNotes} onChange={(event) => setIntakeNotes(event.target.value)} maxLength={1000} rows={2} className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none" />
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <input type="checkbox" checked={physicalItemReceived} onChange={(event) => setPhysicalItemReceived(event.target.checked)} className="mt-0.5 accent-emerald-700" />
            <span>I confirm that the physical item has been received and is held in security custody.</span>
          </label>
          <button type="submit" disabled={isSubmitting || !selectedReportId || !physicalItemReceived || !selectedIntakeLocationId} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Record Intake
          </button>
        </form>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ClipboardCheck className="h-4 w-4 text-blue-700" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">Direct Recovery Queue</h3>
              <p className="text-[11px] text-slate-500">Intake review and approved collection are separate steps.</p>
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {activeRecoveries.length ? activeRecoveries.map((record) => (
              <button
                type="button"
                key={record.directRecoveryId}
                onClick={() => selectRecovery(record.directRecoveryId)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedRecoveryId === record.directRecoveryId ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold text-slate-500">{record.item.referenceNumber}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {record.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-900">{record.item.title}</p>
                <p className="mt-1 text-[11px] text-slate-600">{record.recipient.fullName} ({record.recipient.registrationNumber})</p>
                <p className="mt-1 text-[10px] text-slate-400">Intake by {record.intakeOfficer.fullName}</p>
              </button>
            )) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">No direct recoveries are awaiting review or collection.</p>
            )}
          </div>

          {selectedRecovery?.status === 'INTAKE_RECORDED' && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Review must be performed by a different authorized officer from the intake officer. Student ID and at least one private ownership source are mandatory.</span>
              </div>

              {selectedRecovery.verificationAvailable?.privateDetails && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <button type="button" onClick={handlePrivateVaultView} disabled={isLoadingVault} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    {isLoadingVault ? 'Opening private details...' : 'View Private Ownership Details'}
                  </button>
                  {vaultDetails !== null && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700">{vaultDetails}</pre>}
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={privateDetailsMatched} onChange={(event) => setPrivateDetailsMatched(event.target.checked)} disabled={vaultDetails === null} className="accent-emerald-700" />
                    I matched the private details to the physical item.
                  </label>
                </div>
              )}

              {selectedRecovery.verificationAvailable?.reportPhotos && (
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                  {selectedRecovery.item.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedRecovery.item.primaryImageUrl} alt="Report evidence" className="h-16 w-16 rounded border border-slate-200 object-cover" />
                  ) : null}
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={reportPhotoMatched} onChange={(event) => setReportPhotoMatched(event.target.checked)} className="accent-emerald-700" />
                    I compared an existing report photograph with the item.
                  </span>
                </label>
              )}

              {selectedRecovery.verificationQuestions?.map((question) => (
                <label key={question.id} className="block space-y-1.5 text-xs font-medium text-slate-700">
                  Ownership question: {question.questionText}
                  {question.hint && <span className="block text-[11px] font-normal text-slate-500">Hint: {question.hint}</span>}
                  <input
                    value={verificationAnswers[question.id] || ''}
                    onChange={(event) => setVerificationAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none"
                  />
                </label>
              ))}

              <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-700">
                <input type="checkbox" checked={studentIdVerified} onChange={(event) => setStudentIdVerified(event.target.checked)} className="mt-0.5 accent-emerald-700" />
                I checked the report owner&apos;s university identity in person.
              </label>
              <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                Ownership verification notes <span className="text-red-600">*</span>
                <textarea value={verificationNotes} onChange={(event) => setVerificationNotes(event.target.value)} minLength={20} maxLength={1000} rows={3} required className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none" placeholder="Record the private, photographic, or question-based ownership evidence checked." />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleReview('APPROVE')} disabled={isSubmitting || !studentIdVerified || verificationNotes.trim().length < 20} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                  <ShieldCheck className="h-3.5 w-3.5" /> Approve and Generate OTP
                </button>
                <button type="button" onClick={() => void handleReview('REJECT')} disabled={isSubmitting || rejectionReason.trim().length < 3} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  Reject Recovery
                </button>
              </div>
              <input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} placeholder="Reason required to reject" className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-red-500 focus:outline-none" />
            </div>
          )}

          {selectedRecovery?.status === 'APPROVED' && (
            <form onSubmit={handleCompleteHandover} className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Complete only after the owner presents the OTP and their university ID matches the original lost report.</span>
              </div>
              <label className="block space-y-1.5 text-xs font-medium text-slate-700">
                Claimant collection OTP <span className="text-red-600">*</span>
                <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} required className="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-sm tracking-[0.2em] focus:border-emerald-600 focus:outline-none" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">Security office<select value={selectedHandoverLocationId} onChange={(event) => setHandoverLocationId(event.target.value)} required className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none"><option value="">Select an active custody location</option>{activeCustodyLocations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</select></label>
                <label className="block space-y-1.5 text-xs font-medium text-slate-700">ID type<input value={idCardType} onChange={(event) => setIdCardType(event.target.value)} required maxLength={100} className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none" /></label>
              </div>
              <label className="block space-y-1.5 text-xs font-medium text-slate-700">University ID / registration number<input value={idCardNumber} onChange={(event) => setIdCardNumber(event.target.value)} required maxLength={50} className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none" /></label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" checked={idCardInspected} onChange={(event) => setIdCardInspected(event.target.checked)} className="mt-0.5 accent-emerald-700" /><span>I inspected the physical ID and confirmed the item is being handed to the original report owner.</span></label>
              <label className="block space-y-1.5 text-xs font-medium text-slate-700">Acknowledgement notes<textarea value={acknowledgementNotes} onChange={(event) => setAcknowledgementNotes(event.target.value)} maxLength={1000} rows={2} className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-emerald-600 focus:outline-none" /></label>
              <button type="submit" disabled={isSubmitting || !idCardInspected || otp.length !== 6 || !selectedHandoverLocationId} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <ShieldCheck className="h-3.5 w-3.5" /> Confirm Physical Handover
              </button>
            </form>
          )}
        </div>
      </div>

      {completedRecoveryId && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-700" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Direct recovery completed</p>
              <p className="mt-1 text-[11px] text-emerald-800">The report has left active custody and appears in the owner&apos;s Recovery History.</p>
            </div>
          </div>
          <button type="button" onClick={() => onPrintSlip(completedRecoveryId)} disabled={isPrintingSlip} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">
            <Printer className="h-3.5 w-3.5" /> Print Handover Slip
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Printer className="h-4 w-4 text-slate-700" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">Completed Direct Recoveries</h3>
            <p className="text-[11px] text-slate-500">Saved receipts remain available after leaving this page.</p>
          </div>
        </div>
        {completedRecoveries.length ? (
          <div className="divide-y divide-slate-100">
            {completedRecoveries.map((record) => (
              <div key={record.directRecoveryId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-900">{record.item.title} <span className="font-mono text-slate-500">{record.item.referenceNumber}</span></p>
                  <p className="mt-1 text-[11px] text-slate-500">{record.recipient.fullName} ({record.recipient.registrationNumber}) · {formatDisplayDateTime(record.completedAt || '')}</p>
                </div>
                <button type="button" onClick={() => onPrintSlip(record.directRecoveryId)} disabled={isPrintingSlip} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:self-auto">
                  <Printer className="h-3.5 w-3.5" /> Print Handover Slip
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 py-4 text-xs text-slate-500"><PackageCheck className="h-4 w-4" /> No completed direct recoveries recorded.</p>
        )}
      </div>
    </div>
  );
}
