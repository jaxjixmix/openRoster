"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

export default function MyProfilePage() {
  const router = useRouter();
  const { employee, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (employee) router.replace(`/people/${employee.id}`);
    else router.replace("/");
  }, [employee, loading, router]);

  return <Spinner label="Opening your profile…" />;
}
