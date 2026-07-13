"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";

export type FieldValue = string | number | string[] | null | undefined;

export function FieldValueDisplay({ value }: { value: FieldValue }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-sm italic text-muted-foreground">Não informado</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm italic text-muted-foreground">Não informado</p>;
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm">
        {value.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-wrap text-sm font-medium">{value}</p>;
}

export function FieldRow({ label, value }: { label: string; value: FieldValue }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <FieldValueDisplay value={value} />
    </div>
  );
}

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
