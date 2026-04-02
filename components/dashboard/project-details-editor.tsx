"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Save } from "lucide-react";

interface ProjectDetailsEditorProps {
  projectId: string;
  name: string;
  subtitle: string;
}

export function ProjectDetailsEditor({
  projectId,
  name: initialName,
  subtitle: initialSubtitle,
}: ProjectDetailsEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = name !== initialName || subtitle !== initialSubtitle;

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subtitle }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
        <CardDescription>
          Title and subtitle shown on the landing page of your public
          documentation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">Title</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-subtitle">Subtitle</Label>
          <Input
            id="project-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Welcome to the documentation."
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            <Save className="size-4 mr-2" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
