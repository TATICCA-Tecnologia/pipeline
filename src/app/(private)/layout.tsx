"use client";

import { useAuth } from "@/shared/context/auth-context";
import { AppSidebar } from "@/shared/components";
import { ImpersonationBanner } from "@/shared/components/impersonation-banner";
import { DemoModeBar } from "@/shared/components/demo-mode-bar";
import { DemoModeProvider } from "@/shared/context/demo-mode-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/src/shared/components/ui/spinner";
import { ModalProvider } from "@/src/shared/context/modal-context";
import { NestedModal } from "@/src/shared/components/modals/nested-modal";

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DemoModeProvider>
      <ModalProvider>
        <div className="min-h-screen bg-background">
          <AppSidebar />
          <main className="ml-64">
            <DemoModeBar />
            <ImpersonationBanner />
            <div className="p-6">{children}</div>
          </main>
        </div>
      </ModalProvider>
    </DemoModeProvider>
  );
}
