export function FeaturedTopics() {
  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-8">Featured Topics</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4">
        {[
          { title: "Differential Privacy", desc: "Learn about epsilon, noise, and privacy budgets" },
          { title: "Secure MPC", desc: "Multi-party computation protocols explained" },
          { title: "Zero-Knowledge Proofs", desc: "Prove statements without revealing secrets" },
        ].map((topic) => (
          <div key={topic.title} className="p-6 border rounded-lg hover:shadow-md transition-shadow">
            <h3 className="text-lg font-semibold mb-2">{topic.title}</h3>
            <p className="text-gray-600 text-sm">{topic.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
