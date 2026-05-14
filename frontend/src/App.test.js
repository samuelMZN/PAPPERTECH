import { render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (String(url).includes("/catalogos/publico")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ categorias: [] })
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => []
    });
  });
});

afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

test("renders PapperTech home", async () => {
  render(<App />);
  expect(await screen.findByAltText(/PapperTech/i)).toBeTruthy();
  expect(screen.getByPlaceholderText(/Busca productos, marcas o categorias/i)).toBeTruthy();
});
