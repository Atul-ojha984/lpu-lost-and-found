'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Upload, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle,
  X
} from 'lucide-react';
import { Navbar } from '@/components/navigation/Navbar';
import { Footer } from '@/components/navigation/Footer';
import { FormField } from '@/components/ui/FormField';
import { CATEGORY_LABELS, CAMPUS_ZONE_LABELS } from '@/lib/constants';
import { ItemType, ItemCategory, LPUCampusZone } from '@/types';
import { apiClient, ApiClientError } from '@/lib/api-client';

function ReportContent() {
  const searchParams = useSearchParams();

  const initialType = (searchParams.get('type') as ItemType) || 'LOST';
  const [reportType, setReportType] = useState<ItemType>(initialType);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    category: 'ELECTRONICS' as ItemCategory,
    campusZone: 'BLOCK_30_38' as LPUCampusZone,
    specificLocation: '',
    eventDate: '2026-10-18',
    publicDescription: '',
    privateVaultDetails: '',
    verificationQuestion: '',
    verificationAnswer: '',
  });

  // Photo Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Form State
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submittedItem, setSubmittedItem] = useState<{ id: string; referenceNumber: string } | null>(null);

  // Current User Session
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    apiClient.getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        setIsAuthChecking(false);
      })
      .catch(() => {
        setCurrentUser(null);
        setIsAuthChecking(false);
      });
  }, []);

  // Handle Photo selection and Sharp processing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError(null);

    // Validate type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      setImageError('Unsupported image format. Please select a JPEG, PNG, or WebP photo.');
      return;
    }

    // Validate size: 5MB max
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Photograph exceeds the 5MB size limit. Please choose a smaller file.');
      return;
    }

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // Upload and process via Sharp endpoint
    try {
      setIsUploadingImage(true);
      const uploadRes = await apiClient.uploadImage(file);
      setUploadedImageUrl(uploadRes.url);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setImageError(err.message);
      } else {
        setImageError('Failed to process image through Sharp pipeline. You can still submit without a photo.');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Title is required';
    if (!formData.publicDescription.trim() || formData.publicDescription.trim().length < 5) {
      errors.publicDescription = 'Public description must be at least 5 characters';
    }
    if (!formData.specificLocation.trim()) errors.specificLocation = 'Specific location is required';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const verificationQuestions =
        formData.verificationQuestion.trim() && formData.verificationAnswer.trim()
          ? [
              {
                questionText: formData.verificationQuestion.trim(),
                expectedAnswer: formData.verificationAnswer.trim(),
              },
            ]
          : undefined;

      const created = await apiClient.createReport({
        itemType: reportType,
        title: formData.title.trim(),
        category: formData.category,
        location: formData.campusZone,
        specificLocation: formData.specificLocation.trim(),
        eventDate: formData.eventDate,
        publicDescription: formData.publicDescription.trim(),
        primaryImageUrl: uploadedImageUrl || undefined,
        privateIdentifyingDetails: formData.privateVaultDetails.trim() || undefined,
        verificationQuestions,
      });

      setSubmittedItem({ id: created.id, referenceNumber: created.referenceNumber });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setFormError('Authentication required. Please sign in with your LPU account to file an incident.');
        } else if (err.details && Array.isArray(err.details)) {
          const detailErrors: Record<string, string> = {};
          err.details.forEach((d: { field: string; message: string }) => {
            detailErrors[d.field] = d.message;
          });
          setFieldErrors(detailErrors);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Failed to communicate with property registry. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F8FC]">
      <Navbar />

      <main className="flex-1 py-10 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#20B5AD]">
              <ShieldCheck className="h-4 w-4" />
              <span>Campus Property Incident Reporting</span>
            </span>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#192B4A] sm:text-3xl">
              File a Campus Property Report
            </h1>
            <p className="mt-1 text-xs text-slate-500 max-w-xl mx-auto">
              Submit details to initiate cross-campus matching. Sensitive marks are encrypted into the private vault to prevent fraudulent claims.
            </p>
          </div>

          {/* Unauthenticated Alert Banner */}
          {!isAuthChecking && !currentUser && (
            <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-700 shrink-0" />
                <span>You are currently not logged in. You will need to log in before submitting this report.</span>
              </div>
              <Link
                href="/login?redirect=/report"
                className="shrink-0 rounded-lg bg-amber-700 px-3.5 py-1.5 font-semibold text-white hover:bg-amber-800 transition-colors"
              >
                Log In
              </Link>
            </div>
          )}

          {submittedItem ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs space-y-4 animate-fade-in">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-[#16876A]">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <h2 className="text-xl font-bold text-[#192B4A]">
                Report Successfully Logged
              </h2>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 max-w-md mx-auto">
                <p className="text-xs text-slate-500">Official Tracking Reference</p>
                <p className="text-2xl font-mono font-extrabold text-[#20B5AD] tracking-wider mt-1">
                  {submittedItem.referenceNumber}
                </p>
                <p className="text-[11px] text-slate-500 mt-2">
                  Status: <strong>REPORTED &amp; QUEUED FOR MATCHING</strong>
                </p>
              </div>

              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                Our automated engine will scan all incoming lost and found reports. You can track progress and status under My Reports.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                <Link
                  href={`/items/${submittedItem.id}`}
                  className="rounded-xl lpu-btn-primary px-5 py-2.5 text-xs font-bold shadow-xs hover:bg-[#16A89F] transition-colors"
                >
                  View Public Listing
                </Link>
                <Link
                  href="/dashboard/my-reports"
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Go to My Reports
                </Link>
                <Link
                  href="/board"
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Browse Campus Board
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs">
              {/* Type Switcher Tabs */}
              <div className="flex rounded-xl border border-slate-200 bg-slate-100/70 p-1 mb-8">
                <button
                  type="button"
                  onClick={() => setReportType('LOST')}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-bold tracking-wide transition-all ${
                    reportType === 'LOST'
                      ? 'bg-[#356DE8] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  I Lost An Item On Campus
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('FOUND')}
                  className={`flex-1 rounded-lg py-2.5 text-xs font-bold tracking-wide transition-all ${
                    reportType === 'FOUND'
                      ? 'bg-[#20B5AD] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  I Found An Item On Campus
                </button>
              </div>

              {formError && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Section 1: Item Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                    1. General Item Overview
                  </h3>

                  <FormField
                    id="report-title"
                    label="Item Title / Model"
                    required
                    error={fieldErrors.title}
                    helperText="E.g., Apple iPad 10th Gen (Blue) or Casio fx-991EX Calculator"
                  >
                    <input
                      id="report-title"
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Concise item name and brand"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      required
                    />
                  </FormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField id="report-category" label="Category" required error={fieldErrors.category}>
                      <select
                        id="report-category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value as ItemCategory })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </FormField>

                    <FormField id="report-date" label="Approximate Date" required error={fieldErrors.eventDate}>
                      <input
                        id="report-date"
                        type="date"
                        value={formData.eventDate}
                        onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                        required
                      />
                    </FormField>
                  </div>
                </div>

                {/* Section 2: Campus Location */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                    2. Campus Location Details
                  </h3>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField id="report-zone" label="Campus Zone" required error={fieldErrors.location}>
                      <select
                        id="report-zone"
                        value={formData.campusZone}
                        onChange={(e) => setFormData({ ...formData, campusZone: e.target.value as LPUCampusZone })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      >
                        {Object.entries(CAMPUS_ZONE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label} — {v.area}</option>
                        ))}
                      </select>
                    </FormField>

                    <FormField
                      id="report-specific-loc"
                      label="Specific Spot / Room / Landmark"
                      required
                      error={fieldErrors.specificLocation}
                      helperText="E.g., Block 34 3rd floor Lab 304 or Uni-Mall Food Court Counter"
                    >
                      <input
                        id="report-specific-loc"
                        type="text"
                        value={formData.specificLocation}
                        onChange={(e) => setFormData({ ...formData, specificLocation: e.target.value })}
                        placeholder="Exact room, floor, or bench"
                        className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                        required
                      />
                    </FormField>
                  </div>
                </div>

                {/* Section 3: Redacted Public Description */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                    3. Public Listing Description
                  </h3>

                  <FormField
                    id="report-public-desc"
                    label="Public Description (Displayed on Search Board)"
                    required
                    error={fieldErrors.publicDescription}
                    helperText="Provide generalized non-sensitive details only (color, basic shape, generic brand)."
                  >
                    <textarea
                      id="report-public-desc"
                      rows={3}
                      value={formData.publicDescription}
                      onChange={(e) => setFormData({ ...formData, publicDescription: e.target.value })}
                      placeholder="E.g., Dark blue backpack with silver zippers. Left near the badminton court bleachers..."
                      className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      required
                    />
                  </FormField>
                </div>

                {/* Section 4: Encrypted Private Vault */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Lock className="h-4 w-4 text-red-700" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                      4. Encrypted Private Vault (Hidden from Public)
                    </h3>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs text-red-900">
                    <p className="text-[11px] leading-relaxed">
                      <strong>Zero-Leak Privacy:</strong> Information entered here is encrypted using AES-256-GCM. It will <em>never</em> appear on public search boards and is accessible solely by university security officers adjudicating verified claims.
                    </p>
                  </div>

                  <FormField
                    id="report-private-vault"
                    label="Confidential Identifying Details"
                    helperText="IMEI number, serial number, lock-screen wallpaper, engraving, exact wallet currency denominations, card names."
                  >
                    <textarea
                      id="report-private-vault"
                      rows={3}
                      value={formData.privateVaultDetails}
                      onChange={(e) => setFormData({ ...formData, privateVaultDetails: e.target.value })}
                      placeholder="E.g., Serial: C02XG1... Wallpaper is a mountain picture with an orange sunset. Wallet contains Rs. 350 and SBI debit card ending in 4109."
                      className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      id="report-question"
                      label="Ownership Verification Question"
                      helperText="A question to challenge future claimants."
                    >
                      <input
                        id="report-question"
                        type="text"
                        value={formData.verificationQuestion}
                        onChange={(e) => setFormData({ ...formData, verificationQuestion: e.target.value })}
                        placeholder="E.g., What sticker is on the right corner?"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      />
                    </FormField>

                    <FormField
                      id="report-answer"
                      label="Expected Verification Answer"
                      helperText="Encrypted and hashed on server."
                    >
                      <input
                        id="report-answer"
                        type="text"
                        value={formData.verificationAnswer}
                        onChange={(e) => setFormData({ ...formData, verificationAnswer: e.target.value })}
                        placeholder="E.g., GitHub Octocat sticker"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                      />
                    </FormField>
                  </div>
                </div>

                {/* Section 5: Real Sharp Photo Upload */}
                <div className="space-y-4 pt-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                    5. Photograph (Processed via Sharp Pipeline)
                  </h3>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {previewUrl ? (
                    <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Upload preview"
                        className="h-20 w-20 object-cover rounded-lg border border-slate-200"
                      />
                      <div className="flex-1 text-xs">
                        <p className="font-semibold text-slate-800 truncate">{selectedFile?.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                        </p>
                        {isUploadingImage ? (
                          <p className="text-amber-700 text-[11px] font-medium mt-1">
                            Processing with Sharp (stripping EXIF metadata &amp; optimizing to WebP)...
                          </p>
                        ) : uploadedImageUrl ? (
                          <p className="text-emerald-700 text-[11px] font-medium mt-1 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Processed and ready for report
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        title="Remove photo"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center cursor-pointer hover:bg-slate-100/60 transition-colors"
                    >
                      <Upload className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-xs font-semibold text-slate-800">
                        Click to select photo or browse computer
                      </span>
                      <span className="text-[11px] text-slate-500 mt-1">
                        JPEG, PNG, WebP up to 5MB. Sharp image pipeline strips EXIF/GPS metadata automatically.
                      </span>
                    </div>
                  )}

                  {imageError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {imageError}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <Link
                    href="/board"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Cancel and Return
                  </Link>

                  <button
                    type="submit"
                    disabled={isLoading || isUploadingImage}
                    className="inline-flex items-center gap-2 rounded-xl lpu-btn-primary px-6 py-3 text-xs font-bold shadow-xs hover:bg-[#16A89F] transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20B5AD]"
                  >
                    {isLoading ? (
                      <span>Submitting report to central registry...</span>
                    ) : (
                      <>
                        <span>Submit {reportType === 'LOST' ? 'Lost Property' : 'Found Property'} Report</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Report Form...</div>}>
      <ReportContent />
    </Suspense>
  );
}
