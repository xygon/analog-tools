import { proxyClient } from './createProxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { TRPCClientError } from '@trpc/client';

// Define a type for the mock client structure
type MockClient = {
  users: {
    getUser: {
      query: ReturnType<typeof vi.fn>;
    };
    createUser: {
      mutate: ReturnType<typeof vi.fn>;
    };
  };
};

describe('proxyClient', () => {
  let mockClient: MockClient;
  let mockErrorHandler: (errorData: unknown) => boolean;
  let proxiedClient: MockClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create a mock TRPC client structure
    mockClient = {
      users: {
        getUser: {
          query: vi.fn(),
        },
        createUser: {
          mutate: vi.fn(),
        },
      },
    };

    // Create a mock error handler
    mockErrorHandler = vi.fn().mockReturnValue(false);

    // Create the proxied client
    proxiedClient = proxyClient(mockClient as unknown as Record<string, unknown>, mockErrorHandler) as MockClient;
  });

  it('should create a proxy object with same structure as original client', () => {
    // Assert
    expect(proxiedClient).toHaveProperty('users');
    expect(proxiedClient.users).toHaveProperty('getUser');
    expect(proxiedClient.users).toHaveProperty('createUser');
    expect(proxiedClient.users.getUser).toHaveProperty('query');
    expect(proxiedClient.users.createUser).toHaveProperty('mutate');
  });

  it('should proxy query calls and pass through successful responses', () => {
    // Arrange
    const mockResponse = { id: 1, name: 'Test User' };
    mockClient.users.getUser.query = vi.fn().mockReturnValue(of(mockResponse));

    // Act
    let result: unknown;
    proxiedClient.users.getUser.query().subscribe((data: unknown) => {
      result = data;
    });

    // Assert
    expect(mockClient.users.getUser.query).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });

  it('should proxy mutate calls and pass through successful responses', () => {
    // Arrange
    const mockResponse = { id: 1, success: true };
    mockClient.users.createUser.mutate = vi
      .fn()
      .mockReturnValue(of(mockResponse));

    // Act
    let result: unknown;
    proxiedClient.users.createUser
      .mutate({ name: 'New User' })
      .subscribe((data: unknown) => {
        result = data;
      });

    // Assert
    expect(mockClient.users.createUser.mutate).toHaveBeenCalledWith({
      name: 'New User',
    });
    expect(result).toEqual(mockResponse);
  });

  it('should call error handler when TRPC error occurs', () => {
    // Arrange
    const errorData = {
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      path: '/api/users',
      errorCode: 'SESSION_EXPIRED',
    };

    const trpcError = new TRPCClientError('Unauthorized');
    Object.defineProperty(trpcError, 'data', { value: errorData });
    mockClient.users.getUser.query = vi
      .fn()
      .mockReturnValue(throwError(() => trpcError));

    // Act
    proxiedClient.users.getUser.query().subscribe({
      // @ts-expect-error it should fail as expected
      next: () => fail('Should not succeed'),
      error: () => {
        /* Expected error */
      },
    });

    // Assert
    expect(mockErrorHandler).toHaveBeenCalledWith(errorData);
  });

  it('should complete the observable without error when handler returns true', () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockErrorHandler as any).mockReturnValue(true);

    const errorData = {
      code: 'UNAUTHORIZED',
      httpStatus: 401,
    };

    const trpcError = new TRPCClientError('Unauthorized');
    Object.defineProperty(trpcError, 'data', { value: errorData });
    mockClient.users.getUser.query = vi
      .fn()
      .mockReturnValue(throwError(() => trpcError));

    // Act
    let completed = false;
    proxiedClient.users.getUser.query().subscribe({
      // @ts-expect-error it should fail as expected
      next: () => fail('Should not emit any values'),
      // @ts-expect-error it should fail as expected
      error: () => fail('Should not propagate error when handler returns true'),
      complete: () => {
        completed = true;
      },
    });

    // Assert
    expect(mockErrorHandler).toHaveBeenCalledWith(errorData);
    expect(completed).toBe(true);
  });

  it('should propagate error when handler returns false', () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockErrorHandler as any).mockReturnValue(false);

    const errorData = {
      code: 'UNAUTHORIZED',
      httpStatus: 401,
    };

    const trpcError = new TRPCClientError('Unauthorized');
    Object.defineProperty(trpcError, 'data', { value: errorData });
    mockClient.users.getUser.query = vi
      .fn()
      .mockReturnValue(throwError(() => trpcError));

    // Act
    let errorReceived = false;
    proxiedClient.users.getUser.query().subscribe({
      // @ts-expect-error it should fail as expected
      next: () => fail('Should not emit any values'),
      error: () => {
        errorReceived = true;
      },
      // @ts-expect-error it should fail as expected
      complete: () => fail('Should not complete when handler returns false'),
    });

    // Assert
    expect(mockErrorHandler).toHaveBeenCalledWith(errorData);
    expect(errorReceived).toBe(true);
  });

  it('should not intercept non-query/mutate methods', () => {
    // Arrange
    const mockSomeOtherMethod = vi.fn().mockReturnValue('original');
    (mockClient.users.getUser as unknown as Record<string, unknown>)['someOtherMethod'] = mockSomeOtherMethod;

    // Act
    const result = ((proxiedClient.users.getUser as unknown as Record<string, unknown>)['someOtherMethod'] as () => string)();

    // Assert
    expect(result).toBe('original');
    expect(mockSomeOtherMethod).toHaveBeenCalled();
  });
});
