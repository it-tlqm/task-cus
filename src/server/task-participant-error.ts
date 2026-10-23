/** Lỗi nghiệp vụ phần việc / tuyến duyệt — tách module để tránh vòng import. */
export class ParticipantError extends Error {
  statusCode: number;
  data?: any;
  constructor(message: string, statusCode = 400, data?: any) {
    super(message);
    this.name = "ParticipantError";
    this.statusCode = statusCode;
    this.data = data;
  }
}
