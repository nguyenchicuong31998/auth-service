export interface NotificationSender {
  sendEmail(
    templateKey: string,
    to: string,
    variables: Record<string, string>,
  ): Promise<void>;
}
