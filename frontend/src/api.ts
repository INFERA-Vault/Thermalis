const API_URL = "http://localhost:8000/api/v1";

export async function fetchEvents() {
  const res = await fetch(`${API_URL}/dashboard/events`);
  if (!res.ok) throw new Error("Failed to fetch events");
  return res.json();
}

export async function fetchFacilities() {
  const res = await fetch(`${API_URL}/dashboard/facilities`);
  if (!res.ok) throw new Error("Failed to fetch facilities");
  return res.json();
}

export async function fetchEventDetails(eventId: number) {
  const res = await fetch(`${API_URL}/dashboard/events/${eventId}`);
  if (!res.ok) throw new Error("Failed to fetch event details");
  return res.json();
}

export async function fetchClassification(eventId: number) {
  const res = await fetch(`${API_URL}/classification/predict/${eventId}`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to classify event");
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_URL}/dashboard/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function refreshFirms() {
  const res = await fetch(`${API_URL}/firms/refresh`, {
    method: "POST"
  });
  if (!res.ok) {
      throw new Error("Failed to refresh FIRMS data");
  }
  return res.json();
}

export async function fetchAlerts(params?: { status?: string, severity?: string, alert_type?: string }) {
  let url = `${API_URL}/alerts/`;
  if (params) {
    const qs = new URLSearchParams(params as any).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function fetchAlertCount() {
  const res = await fetch(`${API_URL}/alerts/count`);
  if (!res.ok) throw new Error("Failed to fetch alert count");
  return res.json();
}

export async function acknowledgeAlert(alertId: string) {
  const res = await fetch(`${API_URL}/alerts/${alertId}/acknowledge`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to acknowledge alert");
  return res.json();
}

export async function resolveAlert(alertId: string) {
  const res = await fetch(`${API_URL}/alerts/${alertId}/resolve`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to resolve alert");
  return res.json();
}
