import { Module } from "@nestjs/common";
import { DemoController } from "./demo.controller";
import { DemoLoginService } from "./demo-login.service";

@Module({
	controllers: [DemoController],
	providers: [DemoLoginService],
})
export class DemoModule {}
