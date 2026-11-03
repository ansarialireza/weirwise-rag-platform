export type Locale = "en" | "fa";

export type Direction = "ltr" | "rtl";

export interface TranslationDictionary {
  common: {
    brand: string;
    overview: string;
    knowledge: string;
    assistants: string;
    playground: string;
    signIn: string;
    register: string;
    signOut: string;
    appearance: string;
    theme: string;
    pricing: string;
    blog: string;
    installApp: string;
    account: string;
    user: string;
  };
  auth: {
    signInTitle: string;
    registerTitle: string;
    forgotPasswordTitle: string;
    resetPasswordTitle: string;
    workEmail: string;
    fullName: string;
    companyName: string;
    password: string;
    confirmPassword: string;
    forgot: string;
    noAccount: string;
    haveAccount: string;
    createAccount: string;
    invalidEmailPassword: string;
    authError: string;
    accountNotVerified: string;
    submitting: string;
  };
  landing: {
    badge: string;
    heroHeadline1: string;
    heroHeadline2: string;
    heroSubhead: string;
    sampleBotTitle: string;
    sampleBotSubtitle: string;
    sampleStatus: string;
    sampleUserQuery: string;
    sampleAssistantReply: string;
    sampleCitation: string;
    feature1Tag: string;
    feature1Title: string;
    feature1Desc: string;
    feature2Tag: string;
    feature2Title: string;
    feature2Desc: string;
    feature3Tag: string;
    feature3Title: string;
    feature3Desc: string;
    ctaHeadline: string;
    ctaButton: string;
    copyright: string;
  };
}
