# LPU Lost & Found — Web Application

Next.js 16 App Router frontend for the **Lovely Professional University (LPU) Lost & Found Property Recovery Platform**.

---

## Getting Started

### Prerequisites
- Node.js 20+
- Live Django REST Framework API running on `http://localhost:8000`

### Environment Configuration
Create `.env.local` in this directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Development
```bash
npm run dev
```
The web application will be accessible at [http://localhost:3000](http://localhost:3000).

---

## Application Structure

- `src/app/`: Next.js App Router routes
  - `/`: Landing page and overview
  - `/board`: Public searchable lost & found property feed
  - `/report`: Two-step property reporting wizard with private verification vault
  - `/items/[id]`: Detailed property page with ownership claim submission
  - `/dashboard`: Student & staff recovery hub (filed reports, active claims, automated matches)
  - `/security`: Campus security custody intake desk & physical handover terminal
  - `/admin`: Campus administrator analytics, audit trails, and 90-day retention management
- `src/components/`: Reusable modular UI components (branding, layout, items, dialogs)
- `src/lib/`: Typed API client (`api-client.ts`), formatters, and configuration constants
- `src/types/`: Centralized TypeScript interfaces for domain entities

---

## Verification & Build Commands

```bash
# TypeScript type-checking
npm run typecheck

# ESLint code hygiene
npm run lint

# Production build
npm run build
```
