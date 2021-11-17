/**
 * @license
 * Copyright 2020 Palantir Technologies, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface IUserAgent {
    productName: string;
    productVersion: string;
}

/**
 * @internal
 */
export class UserAgent {
    private readonly stringValue: string;

    constructor(private readonly agents: IUserAgent[]) {
        this.stringValue = [...this.agents].map(formatUserAgent).join(" ");
    }

    public addAgent(agent: IUserAgent): UserAgent {
        return new UserAgent([...this.agents, agent]);
    }

    public toString() {
        return this.stringValue;
    }
}

function formatUserAgent(userAgent: IUserAgent): string {
    const { productName, productVersion } = userAgent;
    return `${productName}/${productVersion}`;
}
