export default function PrivacyPage() {
  return (
    <main className="prose p-8">
      <h1>Privacy Policy</h1>
      <p>PackUp values your privacy. We store your data (email, trips, orders) only in India (Mumbai region).</p>
      <p>Affiliate partners only receive pseudonymized identifiers (click_id), never your personal data.</p>

      <h2>Your Rights</h2>
      <ul>
        <li>Export your data → <code>/api/privacy/export</code></li>
        <li>Delete your data → <code>/api/privacy/delete</code></li>
      </ul>

      <h2>Grievance Officer</h2>
      <p>
        Name: [Your Name] <br/>
        Email: grievance@packup.ai <br/>
        SLA: Acknowledge within 48 hours, resolve within 30 days.
      </p>
    </main>
  );
}

