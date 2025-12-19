import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { SecurityStats } from "@/components/SecurityStats";
import { ProgressDashboard } from "@/components/ProgressDashboard";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container pb-16">
        <HeroSection />
        <SecurityStats />
        <ProgressDashboard />
      </main>
      
      {/* Footer */}
      <footer className="border-t bg-card py-8">
        <div className="container text-center">
          <p className="text-sm text-muted-foreground">
            Zanifu Secure E-Commerce Platform • Academic Research Demonstration
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Showcasing cybersecurity best practices for Kenyan SME fintech
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
