# 🚀 Project: CRM System for Wedding Decor Business

**Client Name:** Third Element Production

---

# 🧠 Objective

Build a **production-ready CRM web application** for a wedding decor business with:

* Secure authentication
* Clean, minimal UI (no animations)
* Mobile-first responsive design
* Excel-like editable tables
* Strong filtering & search
* Customer + Vendor management
* Meetings & payment tracking
* Calendar view
* Manual backup system (JSON + Excel export)

---

# ⚙️ Tech Stack

## Frontend

* React (functional components + hooks)
* Tailwind CSS (minimal, clean UI)
* TanStack Table (editable table)
* FullCalendar (calendar view)

## Backend (BaaS)

* Firebase

  * Firestore (database)
  * Firebase Auth (authentication)

## Deployment

* Vercel (frontend hosting)

---

# 🔐 Authentication (Production Requirement)

## Use Firebase Auth

### Features:

* Email + Password login
* Persistent sessions
* Secure logout

---

## Roles (Simple Model)

For now:

* Single business account OR
* Small team (same access level)

👉 No complex role-based system required initially

---

## Security Rules (Firestore)

Ensure:

* Only authenticated users can read/write data

Example:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

# 💾 Backup Strategy (Manual – Production Safe for Current Scale)

## Approach

Implement **manual export buttons**:

1. Export JSON (full system backup)
2. Export Excel (multi-sheet)

---

## Backup Data Scope

Export ALL collections:

* customers
* meetings
* customer_payments
* vendors
* vendor_transactions

---

## JSON Backup Structure

```json
{
  "exported_at": "ISO_TIMESTAMP",
  "client": "Third Element Production",
  "data": {
    "customers": [],
    "meetings": [],
    "customer_payments": [],
    "vendors": [],
    "vendor_transactions": []
  }
}
```

---

## JSON Export Implementation (React)

```javascript
const fetchAllData = async () => {
  return {
    exported_at: new Date().toISOString(),
    client: "Third Element Production",
    data: {
      customers: await getCustomers(),
      meetings: await getMeetings(),
      customer_payments: await getCustomerPayments(),
      vendors: await getVendors(),
      vendor_transactions: await getVendorTransactions()
    }
  };
};

const downloadJSON = (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-backup-${new Date().toISOString()}.json`;
  a.click();
};
```

---

## Excel Export (Multi-Sheet)

Use library:

```bash
npm install xlsx
```

```javascript
import * as XLSX from "xlsx";

const exportToExcel = (data) => {
  const wb = XLSX.utils.book_new();

  Object.keys(data.data).forEach((key) => {
    const ws = XLSX.utils.json_to_sheet(data.data[key]);
    XLSX.utils.book_append_sheet(wb, ws, key);
  });

  XLSX.writeFile(wb, "crm-backup.xlsx");
};
```

---

## UI Placement

* Add buttons in top-right:

  * Export JSON
  * Export Excel

---

# 🧱 Firestore Data Model

## Collections

### 1. customers

```json
{
  "name": "",
  "phone": "",
  "event_date": "",
  "event_type": "",
  "venue": "",
  "budget": 0,
  "status": "",
  "lead_source": "",
  "notes": "",
  "created_at": ""
}
```

---

### 2. meetings

```json
{
  "customer_id": "",
  "meeting_date": "",
  "attended_by": "",
  "notes": "",
  "next_followup_date": "",
  "created_at": ""
}
```

---

### 3. customer_payments

```json
{
  "customer_id": "",
  "amount": 0,
  "payment_type": "",
  "payment_date": "",
  "payment_method": "",
  "account": "",
  "status": "",
  "notes": ""
}
```

---

### 4. vendors

```json
{
  "name": "",
  "category": "",
  "phone": "",
  "location": "",
  "credit_limit": 0,
  "notes": "",
  "created_at": ""
}
```

---

### 5. vendor_transactions

```json
{
  "vendor_id": "",
  "amount": 0,
  "type": "credit | debit",
  "transaction_date": "",
  "payment_method": "",
  "notes": ""
}
```

---

# 🧭 Application Structure

## Sidebar

* Dashboard
* Customer Management
* Vendor Management
* Calendar

---

# 👥 Customer Management

## Table Columns

* Name
* Phone
* Event Date
* Venue
* Budget
* Status
* Lead Source

---

## Features

* Inline editing
* Search:

  * Name
  * Phone
  * Venue
* Filters:

  * Status
  * Lead Source
  * Event Date range

---

## Customer Detail View (Drawer / Mobile Full Screen)

### Tabs

#### Overview

* Editable fields

#### Meetings

* List + Add meeting

#### Payments

* List + Add payment

---

# 🏢 Vendor Management

## Table Columns

* Name
* Category
* Phone
* Location
* Credit Balance

---

## Vendor Detail

* Transactions list
* Running balance

---

# 📅 Calendar

## Use FullCalendar

### Show:

* Event dates
* Follow-up dates

### Color Coding:

* Wedding → Green
* Follow-up → Blue

---

# 📱 Mobile UX

* Compact list view
* Full-screen detail view
* Sticky search + filters
* Large touch-friendly buttons

---

# 🎨 UI Guidelines

* No animations
* Clean spacing
* Light colors (white / gray)
* Clear typography

---

# ⚡ Performance Guidelines

* Use pagination
* Avoid loading all data at once
* Optimize Firestore queries

---

# 🚀 Build Order

1. Firebase setup + Auth
2. Firestore collections
3. Customer module
4. Vendor module
5. Meetings + Payments
6. Calendar
7. Export feature

---

# 🎯 Key Principles

* Keep UI simple and uncluttered
* Separate data properly (no nesting overload)
* Optimize for mobile usage
* Ensure data safety via manual backups

---

# ✅ Expected Outcome

A production-ready CRM that:

* Is secure (authentication enabled)
* Works smoothly on mobile
* Manages customers, vendors, meetings, and payments
* Allows filtering and search
* Provides calendar visibility
* Supports manual full-system backup

---
