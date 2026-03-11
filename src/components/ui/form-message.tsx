type FeedbackState = {
  kind: "success" | "error";
  message: string;
};

type FormMessageProps = {
  feedback: FeedbackState | null;
};

export function FormMessage({ feedback }: FormMessageProps) {
  if (!feedback) {
    return null;
  }

  return <p className={`form-message ${feedback.kind}`}>{feedback.message}</p>;
}