export interface Features {
  docker: boolean
  maven: boolean
}

export function getFeatures(): Features {
  return {
    docker: process.env.ENABLE_DOCKER !== 'false',
    maven: process.env.ENABLE_MAVEN !== 'false',
  }
}
