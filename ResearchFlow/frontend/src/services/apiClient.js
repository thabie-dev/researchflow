export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  let message = `Request failed with status ${response.status}.`;
  try {
    const body = await response.json();
    if (body.detail) message = body.detail;
  } catch {
    // Keep the status-based message when the server does not return JSON.
  }
  throw new ApiError(message, response.status);
}

export function jsonOptions(method, payload) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
