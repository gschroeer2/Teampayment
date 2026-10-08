/** Future regulated PSD2 adapter. Credentials remain with the regulated provider. */
export interface AccountInformationProvider {
  listTransactions(input: {
    consentId: string;
    fromDate: string;
    toDate: string;
  }): Promise<
    Array<{
      externalId: string;
      amountCents: number;
      currency: string;
      date: string;
      reference: string;
    }>
  >;
}
