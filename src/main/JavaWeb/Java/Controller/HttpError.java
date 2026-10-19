package Controller;

public final class HttpError extends RuntimeException {
  public final int status;

  public HttpError(int status, String message) {
    super(message);
    this.status = status;
  }
}
