import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sheet } from "./sheet";

describe("Sheet modal/drawer component", () => {
  it("renderiza semântica nativa acessível de modal (dialog, role, aria-modal)", () => {
    const html = renderToStaticMarkup(
      createElement(
        Sheet,
        { title: "Novo lançamento", onClose: () => {} },
        createElement("p", null, "Conteúdo do formulário")
      )
    );

    expect(html).toContain("<dialog");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("<h2");
    expect(html).toContain("Novo lançamento</h2>");
    expect(html).toContain('aria-label="Fechar Novo lançamento"');
    expect(html).toContain("Conteúdo do formulário");
  });

  it("suporta role alertdialog e describedBy para confirmações de segurança", () => {
    const html = renderToStaticMarkup(
      createElement(
        Sheet,
        {
          title: "Tem certeza?",
          role: "alertdialog",
          describedBy: "desc-123",
          maxWidth: "sm",
          onClose: () => {},
        },
        createElement("p", { id: "desc-123" }, "Esta ação não pode ser desfeita.")
      )
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-describedby="desc-123"');
    expect(html).toContain("max-w-sm");
  });

  describe("responsividade e centralização (Desktop vs Mobile)", () => {
    it("no desktop (>= md/768px) centraliza vertical e horizontalmente com overlay e cantos arredondados", () => {
      const html = renderToStaticMarkup(
        createElement(
          Sheet,
          { title: "Centralizado Desktop", maxWidth: "lg", onClose: () => {} },
          createElement("div", null, "Form")
        )
      );

      // Dialog container: centralizado no desktop
      expect(html).toContain("open:justify-center");
      expect(html).toContain("md:open:items-center");
      expect(html).toContain("md:px-6");
      expect(html).toContain("md:py-8");

      // Backdrop overlay escurecido
      expect(html).toContain("backdrop:bg-black/60");

      // Painel Section no desktop: arredondado 2xl, limite de altura e escala suave
      expect(html).toContain("md:rounded-2xl");
      expect(html).toContain("md:max-h-[min(88dvh,760px)]");
      expect(html).toContain("max-w-lg");
    });

    it("no mobile (< 768px) atua como bottom-sheet ancorado na base com safe-area", () => {
      const html = renderToStaticMarkup(
        createElement(
          Sheet,
          { title: "Mobile Sheet", onClose: () => {} },
          createElement("div", null, "Form")
        )
      );

      // Alinhamento na base
      expect(html).toContain("open:items-end");
      expect(html).toContain("rounded-t-2xl");
      expect(html).toContain("max-h-[90%]");
      expect(html).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");

      // Puxador visual visível apenas no mobile
      expect(html).toContain("md:hidden");
    });
  });

  describe("rolagem interna e larguras máximas sensatas", () => {
    it("container de conteúdo possui rolagem interna independente (min-h-0 flex-1 overflow-y-auto)", () => {
      const html = renderToStaticMarkup(
        createElement(
          Sheet,
          { title: "Longo Formulário", onClose: () => {} },
          createElement("div", null, "Muitos campos")
        )
      );

      expect(html).toContain("data-sheet-content");
      expect(html).toContain("overflow-y-auto");
      expect(html).toContain("min-h-0");
      expect(html).toContain("flex-1");
      expect(html).toContain("overscroll-contain");
    });

    it("aplica classes de largura máxima conforme especificado", () => {
      const sizes = [
        { size: "sm" as const, expectedClass: "max-w-sm" },
        { size: "md" as const, expectedClass: "max-w-md" },
        { size: "lg" as const, expectedClass: "max-w-lg" },
        { size: "xl" as const, expectedClass: "max-w-xl" },
        { size: "2xl" as const, expectedClass: "max-w-2xl" },
      ];

      for (const { size, expectedClass } of sizes) {
        const html = renderToStaticMarkup(
          createElement(
            Sheet,
            { title: `Tamanho ${size}`, maxWidth: size, onClose: () => {} },
            createElement("span", null, "x")
          )
        );
        expect(html).toContain(expectedClass);
      }
    });
  });

  describe("validação de proporções nos viewports especificados", () => {
    const viewports = [
      { name: "HD Desktop 1280x720", width: 1280, height: 720, mode: "desktop" },
      { name: "Laptop 1366x768", width: 1366, height: 768, mode: "desktop" },
      { name: "Full HD 1920x1080", width: 1920, height: 1080, mode: "desktop" },
      { name: "iPhone 390x844", width: 390, height: 844, mode: "mobile" },
      { name: "Android Compacto 360x640", width: 360, height: 640, mode: "mobile" },
    ];

    it.each(viewports)("respeita limites e margens em $name ($width x $height)", ({ mode }) => {
      const html = renderToStaticMarkup(
        createElement(
          Sheet,
          { title: "Teste Viewport", maxWidth: "lg", onClose: () => {} },
          createElement("div", null, "Conteúdo")
        )
      );

      if (mode === "desktop") {
        expect(html).toContain("md:open:items-center");
        expect(html).toContain("open:justify-center");
        expect(html).toContain("md:max-h-[min(88dvh,760px)]");
      } else {
        expect(html).toContain("open:items-end");
        expect(html).toContain("max-h-[90%]");
      }
    });
  });
});
