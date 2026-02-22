// src/api/client.ts

export class StakeApi {
  static async query<T = any>(query: string, variables: any = {}): Promise<{ data: T; errors?: any[] }> {
    // Use the exposed Electron API from preload script
    const result = await window.electronAPI.invoke('api-request', {
      operationName: this.extractOperationName(query),
      query,
      variables
    });

    if (result.errors && result.errors.length > 0) {
      console.error('GraphQL Errors:', result.errors);
      throw new Error(result.errors[0].message || 'Unknown GraphQL Error');
    }

    return result;
  }

  static async mutate<T = any>(mutation: string, variables: any = {}): Promise<{ data: T; errors?: any[] }> {
    return this.query<T>(mutation, variables);
  }

  private static extractOperationName(query: string): string {
    const match = query.match(/(query|mutation)\s+(\w+)/);
    return match ? match[2] : 'Unknown';
  }
}
