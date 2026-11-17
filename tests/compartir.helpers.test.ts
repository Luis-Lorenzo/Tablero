import { describe, expect, it } from "vitest";
import {
  calcularPosicionRecepcion,
  mensajeSolicitudTransferencia,
  tipoCortoArchivo
} from "../client/src/preview/compartir.js";

describe("helpers de compartir en mesa", () => {
  it("coloca los elementos aceptados en la esquina inferior derecha con escalonamiento", () => {
    const posiciones = [0, 1, 2, 3, 4].map(calcularPosicionRecepcion);
    for (const pos of posiciones) {
      expect(pos.x).toBeGreaterThanOrEqual(80);
      expect(pos.x).toBeLessThanOrEqual(86);
      expect(pos.y).toBeGreaterThanOrEqual(74);
      expect(pos.y).toBeLessThanOrEqual(84);
    }
    expect(posiciones[0]).not.toEqual(posiciones[1]);
    expect(posiciones[1]).not.toEqual(posiciones[2]);
  });

  it("resume el tipo de archivo y construye el texto del diálogo", () => {
    expect(tipoCortoArchivo("application/pdf", "mapa.pdf")).toBe("pdf");
    expect(tipoCortoArchivo("text/plain", "notas.txt")).toBe("txt");
    expect(
      tipoCortoArchivo(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ficha.docx"
      )
    ).toBe("doc");
    expect(tipoCortoArchivo("image/png", "token.png")).toBe("img");

    expect(
      mensajeSolicitudTransferencia({
        id: "1",
        emisorNombre: "Aria",
        tipo: "posit",
        textoPosit: "Hola"
      })
    ).toBe("Aria quiere pasarte nota");

    expect(
      mensajeSolicitudTransferencia({
        id: "2",
        emisorNombre: "Borin",
        tipo: "archivo",
        nombreArchivo: "mapa.pdf",
        mimeArchivo: "application/pdf"
      })
    ).toBe("Borin quiere pasarte mapa.pdf (pdf)");
  });
});
