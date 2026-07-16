"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEMO_MODE_STORAGE_KEY = "pipeline:demoMode";
const MASKED_TEXT_PLACEHOLDER = "Oculto no modo demonstração";

type SequentialLabelKind = "empresa" | "cliente" | "desenvolvedor";

const SEQUENTIAL_LABEL_PREFIX: Record<SequentialLabelKind, string> = {
  empresa: "Empresa",
  cliente: "Cliente",
  desenvolvedor: "Desenvolvedor",
};

type ContactType = "email" | "phone" | "document" | "address" | "website";

const MASKED_CONTACT: Record<ContactType, string> = {
  email: "contato@empresa.demo",
  phone: "(00) 0000-0000",
  document: "00.000.000/0000-00",
  address: "Endereço oculto",
  website: "empresa.demo.com.br",
};

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  maskFreeText: (value: string | null | undefined) => string | null | undefined;
  maskCompanyName: (
    companyId: string | null | undefined,
    companyName: string | null | undefined
  ) => string | null | undefined;
  maskPersonName: (
    personId: string | null | undefined,
    personName: string | null | undefined,
    role: "cliente" | "desenvolvedor"
  ) => string | null | undefined;
  maskContact: (
    value: string | null | undefined,
    type: ContactType
  ) => string | null | undefined;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  // Mapa id-real -> número sequencial, por categoria. Vive só em memória (useRef),
  // reinicia a cada reload de página — aceitável pra uma sessão de demonstração ao vivo.
  const sequentialLabels = useRef<Map<SequentialLabelKind, Map<string, number>>>(
    new Map()
  );

  useEffect(() => {
    const stored = localStorage.getItem(DEMO_MODE_STORAGE_KEY);
    if (stored === "true") setIsDemoMode(true);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((current) => {
      const next = !current;
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const getSequentialLabel = useCallback(
    (kind: SequentialLabelKind, id: string): string => {
      let byId = sequentialLabels.current.get(kind);
      if (!byId) {
        byId = new Map();
        sequentialLabels.current.set(kind, byId);
      }
      let n = byId.get(id);
      if (n === undefined) {
        n = byId.size + 1;
        byId.set(id, n);
      }
      return `${SEQUENTIAL_LABEL_PREFIX[kind]} ${n}`;
    },
    []
  );

  const maskFreeText = useCallback(
    (value: string | null | undefined) => {
      if (!isDemoMode) return value;
      if (value === null || value === undefined || value === "") return value;
      return MASKED_TEXT_PLACEHOLDER;
    },
    [isDemoMode]
  );

  const maskCompanyName = useCallback(
    (companyId: string | null | undefined, companyName: string | null | undefined) => {
      if (!isDemoMode) return companyName;
      if (!companyName) return companyName;
      return getSequentialLabel("empresa", companyId ?? companyName);
    },
    [isDemoMode, getSequentialLabel]
  );

  const maskPersonName = useCallback(
    (
      personId: string | null | undefined,
      personName: string | null | undefined,
      role: "cliente" | "desenvolvedor"
    ) => {
      if (!isDemoMode) return personName;
      if (!personName) return personName;
      return getSequentialLabel(role, personId ?? personName);
    },
    [isDemoMode, getSequentialLabel]
  );

  const maskContact = useCallback(
    (value: string | null | undefined, type: ContactType) => {
      if (!isDemoMode) return value;
      if (!value) return value;
      return MASKED_CONTACT[type];
    },
    [isDemoMode]
  );

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        toggleDemoMode,
        maskFreeText,
        maskCompanyName,
        maskPersonName,
        maskContact,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error("useDemoMode deve ser usado dentro de um DemoModeProvider");
  }
  return context;
}
