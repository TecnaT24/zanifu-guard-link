import { Shield, Lock, CheckCircle2 } from "lucide-react";

export function HeroSection() {
  const highlights = [
    "Cyber Threat Mitigation",
    "Data Protection",
    "Kenya DPA 2019 Compliance",
    "Defence-in-Depth Architecture",
  ];

  return (
    <section className="relative overflow-hidden py-16 lg:py-24">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary mb-6 animate-fade-in">
            <Shield className="h-4 w-4" />
            <span>Academic Research Demonstration</span>
          </div>

          {/* Title */}
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 animate-slide-up">
            Secure E-Commerce for{" "}
            <span className="text-primary">Zanifu Company</span>
          </h1>

          {/* Description */}
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: "100ms" }}>
            A conceptual demonstration platform showcasing cyber threat mitigation, 
            data protection, and regulatory compliance for Kenyan fintech SMEs.
          </p>

          {/* Highlights */}
          <div className="flex flex-wrap justify-center gap-3 animate-slide-up" style={{ animationDelay: "200ms" }}>
            {highlights.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {item}
              </div>
            ))}
          </div>

          {/* Security visual */}
          <div className="mt-12 flex justify-center animate-fade-in" style={{ animationDelay: "300ms" }}>
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 animate-pulse-subtle">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
              </div>
              {/* Orbiting elements */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: "20s" }}>
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-accent" />
              </div>
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: "15s", animationDirection: "reverse" }}>
                <div className="absolute top-1/2 -right-2 -translate-y-1/2 h-3 w-3 rounded-full bg-success" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
