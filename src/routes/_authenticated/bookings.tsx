import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listBookings, saveBooking, cancelBooking, importBookingsCsv } from "@/lib/bookings.functions";
import { listProperties } from "@/lib/properties.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings | AirClean" },
      { name: "description", content: "Add stays by hand or upload a CSV; turnover jobs are created for you." },
      { property: "og:title", content: "Bookings | AirClean" },
      { property: "og:description", content: "Stays in, turnovers scheduled automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  const { orgId } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const bookings = useQuery({
    queryKey: ["bookings", orgId],
    queryFn: () => listBookings({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const properties = useQuery({
    queryKey: ["properties", orgId],
    queryFn: () => listProperties({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [form, setForm] = useState({
    propertyId: "",
    guestName: "",
    guests: 2,
    externalRef: "",
    checkIn: "",
    checkOut: "",
    checkOutTime: "10:00",
    nextCheckInTime: "15:00",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bookings", orgId] });
    qc.invalidateQueries({ queryKey: ["tasks", orgId] });
    qc.invalidateQueries({ queryKey: ["dashboard", orgId] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveBooking({
        data: {
          orgId: orgId!,
          propertyId: form.propertyId,
          guestName: form.guestName || null,
          guests: Number(form.guests),
          externalRef: form.externalRef || null,
          source: "manual",
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          checkOutTime: form.checkOutTime,
          nextCheckInTime: form.nextCheckInTime,
        },
      }),
    onSuccess: () => {
      toast.success("Booking added and turnover scheduled.");
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => importBookingsCsv({ data: { orgId: orgId!, csv } }),
    onSuccess: (res) => {
      toast.success(
        `${res.imported} bookings imported${res.skipped ? `, ${res.skipped} duplicates skipped` : ""}.`,
      );
      if (res.errors.length) {
        toast.message("Some rows could not be read", { description: res.errors.slice(0, 5).join("\n") });
      }
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelBooking({ data: { orgId: orgId!, id } }),
    onSuccess: () => {
      toast.success("Booking cancelled.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeProps = (properties.data ?? []).filter((p) => p.active);

  return (
    <AppShell title="Bookings">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!activeProps.length}>Add booking</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New booking</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select
                    value={form.propertyId}
                    onValueChange={(v) => setForm((f) => ({ ...f, propertyId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProps.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.unitLabel ? ` · ${p.unitLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="ci">Check-in</Label>
                    <Input
                      id="ci"
                      type="date"
                      value={form.checkIn}
                      onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="co">Check-out</Label>
                    <Input
                      id="co"
                      type="date"
                      value={form.checkOut}
                      onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cot">Guests leave at</Label>
                    <Input
                      id="cot"
                      type="time"
                      value={form.checkOutTime}
                      onChange={(e) => setForm((f) => ({ ...f, checkOutTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nci">Next guests arrive</Label>
                    <Input
                      id="nci"
                      type="time"
                      value={form.nextCheckInTime}
                      onChange={(e) => setForm((f) => ({ ...f, nextCheckInTime: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gn">Guest name</Label>
                    <Input
                      id="gn"
                      value={form.guestName}
                      onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gc">Guests</Label>
                    <Input
                      id="gc"
                      type="number"
                      min={1}
                      max={40}
                      value={form.guests}
                      onChange={(e) => setForm((f) => ({ ...f, guests: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !form.propertyId || !form.checkIn || !form.checkOut}
                >
                  Save booking
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Label
            htmlFor="csv"
            className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Upload CSV
          </Label>
          <input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              importCsv.mutate(await file.text());
            }}
          />
          <p className="text-xs text-muted-foreground">
            Columns: property, check_in, check_out, guest, guests, reference.
          </p>
        </div>

        {bookings.isLoading && <Skeleton className="h-40 w-full" />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming and past stays</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {(bookings.data ?? []).length === 0 && !bookings.isLoading && (
              <p className="p-6 text-sm text-muted-foreground">No bookings yet.</p>
            )}
            {(bookings.data ?? []).map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{b.propertyName}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.checkIn} → {b.checkOut} · leaves {b.checkOutTime}, next {b.nextCheckInTime}
                  </p>
                </div>
                {b.guestName && <span className="text-sm text-muted-foreground">{b.guestName}</span>}
                <Badge variant="outline">{b.source}</Badge>
                {b.cancelled ? (
                  <Badge variant="secondary">Cancelled</Badge>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(b.id)}>
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
