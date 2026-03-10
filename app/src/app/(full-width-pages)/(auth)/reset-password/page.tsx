import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password — GeoVera",
  description: "Reset password akun GeoVera kamu",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
