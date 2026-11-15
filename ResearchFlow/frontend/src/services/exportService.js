import { API_BASE_URL, ApiError, jsonOptions } from './apiClient';

export class ExportService {
  async generate(projectId, settings, format) {
    // Determine the API endpoint based on format
    const endpoint = format === 'word' ? 'word' : 'pdf';
    
    const response = await fetch(
      `${API_BASE_URL}/projects/${projectId}/export/${endpoint}`,
      jsonOptions('POST', settings),
    );

    if (!response.ok) {
      let message = `${format.toUpperCase()} generation failed with status ${response.status}.`;
      try {
        const body = await response.json();
        if (body.detail) message = body.detail;
      } catch {
        // Keep the status-based message when no JSON error is returned.
      }
      throw new ApiError(message, response.status);
    }

    return {
      blob: await response.blob(),
      filename: this._filenameFromHeaders(response.headers, format),
    };
  }

  _filenameFromHeaders(headers, format) {
    const disposition = headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const defaultExt = format === 'word' ? '.docx' : '.pdf';
    return match ? match[1] : `research-project${defaultExt}`;
  }
}

export const exportService = new ExportService();