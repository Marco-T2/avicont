import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { AuthService, type TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';

const REFRESH_COOKIE_NAME = 'refreshToken';
// Path scope: la cookie se envía solo a los endpoints de auth.
// Cambiar a Lax si se integra OAuth (deuda técnica anotada en CLAUDE.md).
const REFRESH_COOKIE_PATH = '/api/auth';
// 30 días en milisegundos (Express toma ms y emite Max-Age en segundos).
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

interface RequestWithCookies extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user and tenant' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user — accessToken in body, refreshToken in httpOnly cookie',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const pair = await this.authService.login(dto);
    return this.respondWithTokens(res, pair);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using the refreshToken cookie' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed (cookie rotated)' })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
  async refresh(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
    if (refreshToken === undefined || refreshToken === '') {
      throw new UnauthorizedException('Missing refresh token cookie');
    }
    const pair = await this.authService.refreshTokens(refreshToken);
    return this.respondWithTokens(res, pair);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh token and clear its cookie' })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  async logout(
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
    if (refreshToken !== undefined && refreshToken !== '') {
      await this.authService.logout(refreshToken);
    }
    this.clearRefreshCookie(res);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke ALL sessions of the authenticated user (access + refresh)' })
  @ApiResponse({ status: 204, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async logoutAll(
    @CurrentUser() user: { sub: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.sub);
    this.clearRefreshCookie(res);
  }

  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Switch to a different tenant (rotates refresh cookie)' })
  @ApiResponse({ status: 200, description: 'Tenant switched, new tokens issued' })
  @ApiResponse({ status: 403, description: 'User not a member of tenant' })
  async switchTenant(
    @CurrentUser() user: { sub: string },
    @Body() dto: SwitchTenantDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const pair = await this.authService.switchTenant(user.sub, dto.tenantId);
    return this.respondWithTokens(res, pair);
  }

  // ------------------------------------------------------------
  // Helpers: cookie management
  // ------------------------------------------------------------

  private respondWithTokens(res: Response, pair: TokenPair): { accessToken: string } {
    this.setRefreshCookie(res, pair.refreshToken);
    return { accessToken: pair.accessToken };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      // Secure solo en producción: en dev local el navegador rechaza Secure
      // sobre http://. En prod el deploy debe estar detrás de HTTPS.
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }

  private clearRefreshCookie(res: Response): void {
    // Para borrar una cookie el browser exige match de path + sameSite + secure.
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
