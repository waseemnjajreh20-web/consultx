import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useProfile } from "@/hooks/useProfile";
import LoadingSpinner from "@/components/LoadingSpinner";
import WelcomeEngineerModal from "@/components/WelcomeEngineerModal";

const ChatInterface = lazy(() => import("@/components/ChatInterface"));

const Workspace = () => {
  const navigate = useNavigate();
  const { user, isLoading, canAccessChat } = useEntitlement();
  const { profile } = useProfile();

  // isReady gates render of ChatInterface — set once access is confirmed
  const [isReady, setIsReady] = useState(false);
  const [welcomeTrialEnd, setWelcomeTrialEnd] = useState<string | null>(null);

  // Show welcome modal once for new corporate trial users
  useEffect(() => {
    if (
      profile?.trial_type === "launch_engineer_trial" &&
      profile?.trial_end &&
      !sessionStorage.getItem("welcome_shown_" + user?.id)
    ) {
      sessionStorage.setItem("welcome_shown_" + user?.id, "1");
      setWelcomeTrialEnd(profile.trial_end);
    }
  }, [profile, user?.id]);

  // Access gate — runs once loading resolves
  useEffect(() => {
    if (isLoading) return;

    // No user → send to login
    if (!user) {
      navigate("/auth");
      return;
    }

    // Any authenticated user (paid, trial, free-tier, admin) may enter the workspace.
    // Backend enforces mode availability and daily message limits.
    if (canAccessChat) {
      setIsReady(true);
    }
  }, [isLoading, user, canAccessChat, navigate]);

  if (isLoading || !isReady) return <LoadingSpinner />;

  return (
    <>
      {welcomeTrialEnd && (
        <WelcomeEngineerModal
          trialEnd={welcomeTrialEnd}
          onClose={() => setWelcomeTrialEnd(null)}
        />
      )}
      <Suspense fallback={<LoadingSpinner />}>
        <ChatInterface onBack={() => navigate("/")} />
      </Suspense>
    </>
  );
};

export default Workspace;
