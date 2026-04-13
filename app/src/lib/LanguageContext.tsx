import React, { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "pt";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  en: {
    "NEW ESCROW CONTRACT": "NEW ESCROW CONTRACT",
    "AMOUNT (USDC)": "AMOUNT (USDC)",
    "PAYER ADDRESS": "PAYER ADDRESS",
    "ORACLE ADDRESS": "ORACLE ADDRESS",
    "MILESTONE DESCRIPTION": "MILESTONE DESCRIPTION",
    "INITIALIZE CONTRACT": "INITIALIZE CONTRACT",
    "CONTRACT MONITOR": "CONTRACT MONITOR",
    "OPEN DISPUTE": "OPEN DISPUTE",
    "ORACLE VERDICT": "ORACLE VERDICT",
    "CREATE": "CREATE",
    "MONITOR": "MONITOR",
    "DISPUTE": "DISPUTA",
    "TIMEOUT (DAYS)": "TIMEOUT (DAYS)",
  },
  pt: {
    "NEW ESCROW CONTRACT": "NOVO CONTRATO DE ESCROW",
    "AMOUNT (USDC)": "VALOR (USDC)",
    "PAYER ADDRESS": "ENDEREÇO DO PAGADOR",
    "ORACLE ADDRESS": "ENDEREÇO DO ORÁCULO",
    "MILESTONE DESCRIPTION": "DESCRIÇÃO DO MARCO",
    "INITIALIZE CONTRACT": "INICIALIZAR CONTRATO",
    "CONTRACT MONITOR": "MONITOR DE CONTRATOS",
    "OPEN DISPUTE": "ABRIR DISPUTA",
    "ORACLE VERDICT": "VEREDITO DO ORÁCULO",
    "CREATE": "CRIAR",
    "MONITOR": "MONITORAR",
    "DISPUTE": "DISPUTA",
    "TIMEOUT (DAYS)": "TIMEOUT (DIAS)",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>("en");

  const t = (key: string) => {
    return translations[language][key as keyof typeof translations["en"]] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
