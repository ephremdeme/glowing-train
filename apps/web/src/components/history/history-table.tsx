'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TransferHistoryItem } from '@/lib/contracts';

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function HistoryTable({ items }: { items: TransferHistoryItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transfers</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transfers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Transfer</th>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.transferId} className="border-b border-border/40">
                    <td className="px-3 py-3">{item.transferId}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{item.chain.toUpperCase()} / {item.token}</Badge>
                    </td>
                    <td className="px-3 py-3">{currencyUsd(item.sendAmountUsd)}</td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary">{item.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/transfers/${item.transferId}` as Route} className="text-primary hover:underline">
                          Status
                        </Link>
                        <Link href={`/receipts/${item.transferId}` as Route} className="text-primary hover:underline">
                          Receipt
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
