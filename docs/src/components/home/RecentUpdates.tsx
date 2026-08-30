export function RecentUpdates() {
  return (
    <section className="py-12 bg-gray-50">
      <h2 className="text-2xl font-bold text-center mb-6">Recent Updates</h2>
      <div className="max-w-3xl mx-auto px-4 space-y-4">
        {[
          { date: "2024-01-15", title: "PQL v2.0 Released", desc: "New privacy-preserving query language features" },
          { date: "2024-01-10", title: "HSM Integration Guide", desc: "Hardware security module setup documentation" },
          { date: "2024-01-05", title: "Compliance Automation", desc: "Automated GDPR/CCPA compliance checks" },
        ].map((update) => (
          <div key={update.title} className="p-4 bg-white rounded-lg border">
            <span className="text-xs text-gray-500">{update.date}</span>
            <h3 className="font-medium mt-1">{update.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{update.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
