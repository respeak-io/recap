import Link from "next/link";
import { Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrations closed</CardTitle>
        <CardDescription>
          We are not accepting new sign-ups at this time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 mb-2 font-medium text-foreground">
            <Mail className="size-4" />
            Request access
          </div>
          <p>
            Please email{" "}
            <a
              href="mailto:info@respeak.io"
              className="underline text-foreground hover:text-primary"
            >
              info@respeak.io
            </a>{" "}
            to request an account.
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
