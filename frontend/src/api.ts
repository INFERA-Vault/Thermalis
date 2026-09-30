const CONFIGURED_API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const API_URL = CONFIGURED_API_URL.endsWith("/api/v1")
  ? CONFIGURED_API_URL
  : `${CONFIGURED_API_URL}/api/v1`;

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

export async function fetchEvidenceAssessment(eventId: number) {
  const res = await fetch(`${API_URL}/evidence/assess/${eventId}`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to build evidence assessment");
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

export async function fetchEmergencyStatus() {
  const res = await fetch(`${API_URL}/emergency/status`);
  if (!res.ok) throw new Error("Failed to fetch emergency dispatch status");
  return res.json();
}

export async function dispatchEmergencyAlert(alertId: string, adminKey: string, force = false) {
  const query = force ? "?force=true" : "";
  const res = await fetch(`${API_URL}/emergency/dispatch/${alertId}${query}`, {
    method: "POST",
    headers: {
      "X-Emergency-Admin-Key": adminKey,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Emergency dispatch request failed");
  }
  return body;
}

export async function fetchAlertDispatches(alertId: string, adminKey: string) {
  const res = await fetch(`${API_URL}/emergency/dispatches/${alertId}`, {
    headers: {
      "X-Emergency-Admin-Key": adminKey,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to fetch dispatch audit");
  }
  return body;
}
