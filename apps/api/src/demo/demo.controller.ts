import { appUrl, env } from "@crm/auth/env";
import {
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	HttpException,
	HttpStatus,
	Logger,
	NotFoundException,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import {
	ApiExcludeEndpoint,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { DemoLoginService } from "./demo-login.service";
import { DemoRateLimiter } from "./demo-rate-limit";

@ApiTags("Demo")
@Controller("demo")
export class DemoController {
	private readonly logger = new Logger(DemoController.name);
	private readonly limiter = new DemoRateLimiter();

	constructor(private readonly demo: DemoLoginService) {}

	@Get()
	@AllowAnonymous()
	@ApiOperation({ summary: "Report whether the public demo sign-in is on" })
	@ApiOkResponse({ schema: { example: { enabled: false } } })
	status() {
		return { enabled: this.demo.isEnabled() };
	}

	@Post("session")
	@AllowAnonymous()
	@HttpCode(HttpStatus.SEE_OTHER)
	@ApiExcludeEndpoint()
	async signIn(@Req() req: Request, @Res() res: Response) {
		const email = this.demo.demoEmail();
		if (!email) throw new NotFoundException();

		const origin = req.get("origin");
		if (!origin || !env.trustedOrigins.includes(origin)) {
			throw new ForbiddenException("Cross-origin demo sign-in is refused.");
		}

		if (!this.limiter.take(req.ip ?? "unknown")) {
			throw new HttpException(
				"Too many demo sign-ins. Try again later.",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const cookie = await this.demo.mintSession(email, {
			ipAddress: req.ip,
			userAgent: req.get("user-agent"),
		});

		this.logger.log({ message: "Demo session minted" });

		res.cookie(cookie.name, cookie.value, {
			...cookie.attributes,
			expires: cookie.expiresAt,
		});
		res.redirect(HttpStatus.SEE_OTHER, `${appUrl}/`);
	}
}
