export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

export async function apiRequest(path, options = {}) {
  const { method = "GET", token, body } = options;
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (_error) {
    throw new Error(
      `No se pudo conectar con el backend en ${API_URL}. Verifica que el servidor este encendido.`
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detailedMessage =
      data.message && data.error ? `${data.message}: ${data.error}` : data.message;

    throw new Error(detailedMessage || "Error al procesar la solicitud");
  }

  return data;
}
