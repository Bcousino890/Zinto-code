import Header from '@/components/layout/Header';
import RoleBasedOnboarding from '@/components/role-based-onboarding';

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden font-sans text-gray-800">
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          <RoleBasedOnboarding className="max-w-5xl mx-auto" />
        </div>
      </div>
    </div>
  );
}
