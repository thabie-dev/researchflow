import { apiRequest } from './apiClient';

export class ComparisonService {
  compare(firstDocument, secondDocument) {
    const formData = new FormData();
    formData.append('first_document', firstDocument);
    formData.append('second_document', secondDocument);
    return apiRequest('/comparison', { method: 'POST', body: formData });
  }

  compareBulk(documents) {
    const formData = new FormData();
    for (const document of documents) {
      formData.append('documents', document);
    }
    return apiRequest('/comparison/bulk', { method: 'POST', body: formData });
  }
}

export const comparisonService = new ComparisonService();
