import { resetPasswordDto } from "./reset-password.dto";

export const verifyResetCodeDto = resetPasswordDto.pick({ email: true, code: true });

export type VerifyResetCodeDto = typeof verifyResetCodeDto._output;
