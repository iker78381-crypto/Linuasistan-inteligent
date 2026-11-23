export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const rawText = await res.text();
  const trimmed = rawText.trim();

  const looksLikeHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (looksLikeHtml) {
    throw new Error(
      res.status >= 500
        ? 'El servidor tardó demasiado en responder o se está reiniciando. Inténtalo de nuevo en unos segundos.'
        : 'La ruta del servidor devolvió una página HTML en lugar de datos JSON. Recarga la aplicación e inténtalo de nuevo.'
    );
  }

  let parsed: unknown = null;
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(
        res.ok
          ? 'La respuesta del servidor no tiene formato JSON válido.'
          : `Error del servidor (${res.status}). Inténtalo de nuevo.`
      );
    }
  }

  if (!res.ok) {
    const errMsg =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `Error del servidor (${res.status}).`;
    throw new Error(errMsg);
  }

  return parsed as T;
}
