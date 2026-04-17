import Link from "next/link";

import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Смета</h1>
      <p className="mt-2 text-muted-foreground">
        ID: <code className="font-mono text-sm">{id}</code>
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Редактор сметы появится в задаче E9.2.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/estimates">← Назад к списку</Link>
      </Button>
    </div>
  );
}
